import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pathToExtension = path.join(__dirname, "..", "dist");

/**
 * A persistent Chromium with the extension loaded, shared by every test in a
 * worker. Cold launching used to happen ~101×; it now happens 6× (one per
 * worker). Playwright's built-in `context` and `page` fixtures are test-scoped
 * and we cannot re-scope them, so we expose this as `_persistentContext` and
 * have the test-scoped `context`/`page` fixtures alias / derive from it.
 */
type WorkerFixtures = {
  _persistentContext: BrowserContext;
  extensionId: string;
};

export const test = base.extend<{ page: Page; context: BrowserContext }, WorkerFixtures>({
  _persistentContext: [
    async ({ browser: _browser }, use) => {
      void _browser;
      const context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        args: [
          `--disable-extensions-except=${pathToExtension}`,
          `--load-extension=${pathToExtension}`,
          // New headless mode (Chrome 109+) supports extensions and runs
          // noticeably faster than headed mode for context launch + paint.
          "--headless=new",
        ],
      });
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],

  extensionId: [
    async ({ _persistentContext }, use) => {
      let [serviceWorker] = _persistentContext.serviceWorkers();
      if (!serviceWorker) {
        serviceWorker = await _persistentContext.waitForEvent("serviceworker");
      }
      const extensionId = serviceWorker.url().split("/")[2];
      if (!extensionId) {
        throw new Error("Could not parse extension id from service worker URL");
      }
      await use(extensionId);
    },
    { scope: "worker" },
  ],

  // Alias the worker context as the test-scoped `context` fixture so existing
  // test code continues to receive a working BrowserContext.
  context: async ({ _persistentContext }, use) => {
    await use(_persistentContext);
  },

  page: async ({ _persistentContext }, use) => {
    // Close any pages left over from a prior test in the same worker.
    for (const stalePage of _persistentContext.pages()) {
      await stalePage.close().catch(() => {});
    }

    // Reset extension state. The persistent context is worker-scoped, so the
    // service worker and its module-private state survive across tests; we
    // must wipe both storage AND the SW's in-memory credentials staging.
    // `__e2eResetSwState` is exposed only in non-production builds (see
    // src/background/service-worker.ts).
    let [serviceWorker] = _persistentContext.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await _persistentContext
        .waitForEvent("serviceworker", { timeout: 5_000 })
        .catch(() => undefined as never);
    }
    if (serviceWorker) {
      await serviceWorker
        .evaluate(async () => {
          await chrome.storage.local.clear();
          await chrome.storage.session.clear();
          (globalThis as { __e2eResetSwState?: () => void }).__e2eResetSwState?.();
        })
        .catch(() => undefined);
    }

    const page = await _persistentContext.newPage();
    await use(page);

    // Close everything opened during this test so the next test's cleanup is cheap.
    for (const openPage of _persistentContext.pages()) {
      await openPage.close().catch(() => {});
    }
  },
});

export const expect = test.expect;
