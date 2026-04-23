import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./extension-fixture";
import { PLAN_GATE } from "./constants";
import {
  E2E_EMAIL,
  E2E_MASTER_PASSWORD,
  E2E_PASSWORD,
  E2E_TOTP_SECRET,
} from "./test-credentials";

export async function gotoPrimarySurface(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/sidebar.html`);
}

export async function clearVaultIfPossible(page: Page): Promise<void> {
  const clearBtn = page.locator("#clear-vault-debug-btn");
  if (await clearBtn.isVisible()) {
    page.once("dialog", (d) => {
      d.accept();
    });
    await clearBtn.click();
    await expect(page.locator("#mode-hint")).toContainText("First-time setup");
  }
}

export async function setupVault(page: Page): Promise<void> {
  await page.locator("#email").fill(E2E_EMAIL);
  await page.locator("#password").fill(E2E_PASSWORD);
  await page.locator("#totpSecret").fill(E2E_TOTP_SECRET);
  await page.locator("#masterPassword").fill(E2E_MASTER_PASSWORD);
  await page
    .locator("#vault-form")
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator("#status")).toContainText("Saved", { timeout: 15_000 });
}

export async function lockVault(page: Page): Promise<void> {
  await page.locator("#lock-btn").click();
  await expect(page.locator("#mode-hint")).toContainText("Enter your master password");
}

export async function waitForAutofillWindow(page: Page, waitMs = 5000): Promise<void> {
  // AUTO_FILL_REQUEST and delayed DOM insertion are async; wait a full window for negatives.
  await page.waitForTimeout(waitMs);
}

export async function expectInputRemainsEmpty(
  input: Locator,
  page: Page,
  waitMs = 5000
): Promise<void> {
  await waitForAutofillWindow(page, waitMs);
  await expect(input).toHaveValue("");
}

/**
 * Wraps test.describe with a plan-gate check. When PLAN_GATE < minPlan the
 * entire block is skipped (appears as "skipped", not "failed") so that tests
 * for unimplemented plans never pollute CI output.
 *
 * Usage: PLAN_GATE=7 npm run test:e2e  → runs plans 01-07, skips 08-12.
 */
export const describePlan = (
  minPlan: number,
  title: string,
  fn: () => void
): void => {
  if (PLAN_GATE >= minPlan) {
    test.describe(title, fn);
  } else {
    test.describe.skip(title, fn);
  }
};

/**
 * Builds the sidebar URL hash that puts onboarding v2 in dev mode and points
 * it at a custom CUNY fixture URL instead of the live CUNY SSO site.
 */
export const onboardingHashWith = (cunyUrl: string): string =>
  `#onboarding=1&cuny=${encodeURIComponent(cunyUrl)}`;

/**
 * Navigates the onboarding sidebar from WELCOME through EMAIL_ENTRY to
 * PASSWORD_ENTRY, filling in test credentials. Does NOT click the forward
 * button on the password screen — the caller decides when to proceed.
 */
export async function walkToPasswordEntry(page: Page): Promise<void> {
  await page.locator("[data-onboarding-welcome-cta='true']").click();
  await page.locator("[data-onboarding-email-input='true']").fill(E2E_EMAIL);
  await page.locator("[data-onboarding-email-forward='true']").click();
  await page.locator("[data-onboarding-password-input='true']").fill(E2E_PASSWORD);
}
