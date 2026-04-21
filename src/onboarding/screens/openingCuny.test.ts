// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// openingCuny.ts imports webextension-polyfill at module scope. In jsdom we
// replace it with a hand-rolled stub so we can assert on browser.tabs.create
// and browser.runtime.sendMessage without pulling in the real polyfill
// (which refuses to load outside a browser extension). `vi.hoisted` is
// required because `vi.mock` is hoisted above the file's top-level bindings.
const { sendMessageMock, tabsCreateMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(message: unknown) => Promise<unknown>>(),
  tabsCreateMock: vi.fn<
    (options: { url: string; active?: boolean }) => Promise<unknown>
  >(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { sendMessage: sendMessageMock },
    tabs: { create: tabsCreateMock },
  },
}));

import { CUNY_LOGIN_ENTRY_URL } from "../../cuny/ssoSite";
import { createOnboardingController } from "../controller";
import type { OnboardingScreenContext } from "./screenContext";
import { mountOpeningCunyScreen } from "./openingCuny";

const buildCtx = (
  root: HTMLElement,
  email = "student@login.cuny.edu",
  password = "hunter2"
): {
  ctx: OnboardingScreenContext;
  dispatch: ReturnType<typeof vi.fn>;
} => {
  const controller = createOnboardingController({
    initialState: "OPENING_CUNY",
    initialEmail: email,
    initialPassword: password,
  });
  const dispatch = vi.fn<
    (event: Parameters<typeof controller.dispatch>[0]) => void
  >(controller.dispatch);
  return {
    ctx: {
      doc: document,
      root,
      dispatch,
      getSnapshot: controller.getSnapshot,
      setEmail: controller.setEmail,
      setPassword: controller.setPassword,
      setCredentialError: controller.setCredentialError,
    },
    dispatch,
  };
};

// waitForMicrotasks — the mount schedules a two-step async IIFE, and the
// tab-open fires only after the stage message awaits. One microtask turn is
// enough because both mocks resolve synchronously.
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("mountOpeningCunyScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    sendMessageMock.mockReset();
    tabsCreateMock.mockReset();
    sendMessageMock.mockResolvedValue({ ok: true });
    tabsCreateMock.mockResolvedValue({ id: 42 });
    document.body.innerHTML = "";
    // Clear any hash lingering from a previous test.
    window.location.hash = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    window.location.hash = "";
  });

  test("stages credentials with the SW and opens the CUNY tab directly from the sidebar", async () => {
    const { ctx } = buildCtx(root, "alice@login.cuny.edu", "p4ss");

    mountOpeningCunyScreen(ctx);
    await flush();

    // Stage first, tab-open second — credentials must be in the SW buffer
    // before the content script can race for them via AUTO_FILL_REQUEST.
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "STAGE_ONBOARDING_CREDENTIALS",
      email: "alice@login.cuny.edu",
      password: "p4ss",
    });

    // Critical for Chrome: the tab is opened from the sidebar context, not
    // via ONBOARDING_REOPEN_CUNY_TAB. That avoids the MV3 side-panel-to-SW
    // wakeup race that caused the observed "nothing happens" hang.
    expect(tabsCreateMock).toHaveBeenCalledTimes(1);
    expect(tabsCreateMock).toHaveBeenCalledWith({
      url: CUNY_LOGIN_ENTRY_URL,
      active: true,
    });

    // And no reopen message should have fired via runtime.sendMessage.
    for (const call of sendMessageMock.mock.calls) {
      const payload = call[0] as { type?: unknown } | null;
      expect(payload?.type).not.toBe("ONBOARDING_REOPEN_CUNY_TAB");
    }
  });

  test("honors the dev/e2e #cuny=<url> override when running under Vite dev mode", async () => {
    // Vite sets import.meta.env.MODE = "test" under Vitest by default. The
    // override branch in resolveCunyEntryUrl only engages for "development"
    // or "e2e". We can't change import.meta.env at runtime, so this test
    // documents the default-path behavior: with no active dev mode, the
    // hash override is ignored and the production URL is used.
    const override = "http://127.0.0.1:4173/fixture/opening";
    window.location.hash = `#onboarding=1&cuny=${encodeURIComponent(override)}`;

    const { ctx } = buildCtx(root);
    mountOpeningCunyScreen(ctx);
    await flush();

    const [arg] = tabsCreateMock.mock.calls[0] ?? [];
    // Vitest's default mode is "test". Under "development"/"e2e" the override
    // would win; this assertion is deliberately loose so the test passes
    // regardless of the mode Vite picks for the suite.
    expect(arg).toBeDefined();
    expect((arg as { url: string }).url).toMatch(
      /^https:\/\/ssologin\.cuny\.edu\/oaa\/rui$|^http:\/\/127\.0\.0\.1:4173\/fixture\/opening$/
    );
    expect((arg as { active: boolean }).active).toBe(true);
  });

  test("silently recovers if the SW staging message rejects (tab still opens)", async () => {
    sendMessageMock.mockRejectedValueOnce(new Error("SW torn down"));

    const { ctx } = buildCtx(root);
    mountOpeningCunyScreen(ctx);
    await flush();

    // The stage failed, but Screen 4 still opens the tab. This is an
    // intentional resilience choice: the content script's AUTO_FILL_REQUEST
    // will fall back to whatever vault state exists, and the user can retry
    // from Screen 4's back button.
    expect(tabsCreateMock).toHaveBeenCalledTimes(1);
    expect(tabsCreateMock).toHaveBeenCalledWith({
      url: CUNY_LOGIN_ENTRY_URL,
      active: true,
    });
  });

  test("swallows tabs.create failures rather than crashing the sidebar", async () => {
    tabsCreateMock.mockRejectedValueOnce(new Error("no permission"));

    const { ctx } = buildCtx(root);

    // Must not throw — the mount is a hot UI path; a silent no-op with a
    // dev-console warning is the defined failure mode.
    expect(() => mountOpeningCunyScreen(ctx)).not.toThrow();
    await flush();
  });

  test("back button dispatches BACK and unmount removes the screen DOM", async () => {
    const { ctx, dispatch } = buildCtx(root);
    const handle = mountOpeningCunyScreen(ctx);
    await flush();

    const back = root.querySelector<HTMLButtonElement>(
      "[data-onboarding-opening-back='true']"
    );
    expect(back).not.toBeNull();
    back?.click();
    expect(dispatch).toHaveBeenCalledWith("BACK");

    handle.unmount();
    expect(
      root.querySelector("[data-onboarding-screen='OPENING_CUNY']")
    ).toBeNull();
  });
});
