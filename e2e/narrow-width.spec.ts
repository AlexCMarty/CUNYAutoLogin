import type { Page } from "@playwright/test";
import { ONBOARDING_STATES } from "../src/onboarding/state";
import { expect, test } from "./extension-fixture";
import { lockVault, setupVault } from "./helpers";

/**
 * Firefox's revamped sidebar opens extension panels at 240 CSS px on a fresh
 * profile (measured: window.innerWidth === 240). This guard renders every
 * sidebar surface at that width and asserts none of them overflow horizontally,
 * so the layout never regresses back to clipping content (see sidebar.css —
 * the former `body { min-width: 300px }` clamp caused exactly that).
 */

const NARROW_VIEWPORT = { width: 240, height: 800 } as const;

// CREDENTIAL_ERROR is a placeholder state with no mounted screen, so it is not
// reachable via the `#qa=` dev jump. Every other onboarding state is.
const JUMPABLE_ONBOARDING_STATES = ONBOARDING_STATES.filter(
  (state) => state !== "CREDENTIAL_ERROR"
);

/** Horizontal overflow of the document root, in CSS px (0 = fits exactly). */
async function rootHorizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

test.describe("sidebar fits Firefox's 240px default panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(NARROW_VIEWPORT);
  });

  for (const state of JUMPABLE_ONBOARDING_STATES) {
    test(`onboarding ${state} does not overflow at 240px`, async ({ page, extensionId }) => {
      await page.goto(`chrome-extension://${extensionId}/sidebar.html#qa=${state}`);
      await page
        .locator("#onboarding-root:not([hidden])")
        .waitFor({ state: "visible", timeout: 15_000 });

      // Allow 1px for sub-pixel rounding; anything larger is real overflow.
      expect(await rootHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  }

  test("vault (unlocked) does not overflow at 240px", async ({ page, extensionId }) => {
    await setupVault(page, extensionId);
    expect(await rootHorizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("vault (locked) does not overflow at 240px", async ({ page, extensionId }) => {
    await setupVault(page, extensionId);
    await lockVault(page);
    expect(await rootHorizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});
