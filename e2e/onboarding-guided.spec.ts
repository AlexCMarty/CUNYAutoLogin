/**
 * Overlay engine, guided CUNY self-service steps, verify + set-default.
 *
 * Test setup pattern: walk sidebar to ALLOW_GATE state using the existing
 * credential-advance fixture chain, then navigate the CUNY tab manually to
 * each fixture view for the specific step being tested.
 *
 * Overlay DOM attributes:
 *   data-cuny-autologin-overlay="true"   — dim layer
 *   data-cuny-autologin-highlight="true" — target element ring
 *   data-cuny-autologin-tooltip="true"   — tooltip bubble
 *   data-cuny-autologin-step-chip="true" — "Step N of M" chip
 */
import type { Page } from "@playwright/test";
import { TOTP } from "totp-generator";
import {
  PENDING_TOTP_SECRET_SESSION_KEY,
  RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID,
  TOTP_GENERATION_OPTIONS,
} from "../src/cuny/ssoSite";
import {
  ALLOW_GATE_FIXTURE_URL,
  ALLOW_GATE_NEXT_OAA_HOME_FIXTURE_URL,
  CREDENTIAL_FIXTURE_ADVANCE_URL,
  FACTORS_LIST_FIXTURE_URL,
  FACTORS_LIST_FULL_FIXTURE_URL,
  FACTORS_POST_ENROLL_FIXTURE_URL,
  FACTORS_POST_ENROLL_UNVERIFIED_FIXTURE_URL,
  TOTP_ENROLL_SECRET_FIXTURE_URL,
  TOTP_ENROLL_VERIFY_FIXTURE_URL,
  TOTP_ENROLL_VERIFY_WRONG_CODE_FIXTURE_URL,
} from "./constants";
import { expect, test } from "./extension-fixture";
import {
  clearVaultIfPossible,
  gotoPrimarySurface,
  onboardingHashWith,
  setupVault,
  walkToPasswordEntry,
} from "./helpers";
import { E2E_TOTP_SECRET } from "./test-credentials";

async function closeCunyTab(tab: Page | undefined): Promise<void> {
  if (!tab) return;
  await tab.close().catch(() => {});
}

/**
 * Walks the onboarding flow to ALLOW_GATE state. Returns the CUNY tab that
 * opened during the flow; it will be at /oaa-totp-factor/ when returned.
 * Caller is responsible for navigating the tab further and closing it.
 */
async function setupToAllowGate(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  extensionId: string
): Promise<Page> {
  await gotoPrimarySurface(page, extensionId);
  await clearVaultIfPossible(page);
  await setupVault(page);
  await page.goto(
    `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(CREDENTIAL_FIXTURE_ADVANCE_URL)}`
  );
  await walkToPasswordEntry(page);

  const tabPromise = context.waitForEvent("page");
  await page.locator("[data-onboarding-password-forward='true']").click();
  const cunyTab = await tabPromise;
  await cunyTab.waitForLoadState("domcontentloaded");

  await expect(page.locator("[data-onboarding-screen='CUNY_TOTP']")).toBeVisible({
    timeout: 15_000,
  });

  await cunyTab.goto(ALLOW_GATE_FIXTURE_URL);
  await expect(page.locator("[data-onboarding-screen='ALLOW_GATE']")).toBeVisible({
    timeout: 10_000,
  });

  return cunyTab;
}


test.describe("overlay: dim layer and highlight ring", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(ALLOW_GATE_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("dim layer injected on CUNY tab when sidebar reaches ALLOW_GATE", async () => {
    await expect(
      cunyTab.locator("[data-cuny-autologin-overlay='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Allow button carries the highlight ring attribute", async () => {
    await expect(
      cunyTab.locator("button[data-cuny-autologin-highlight='true']")
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      cunyTab.locator("button[data-cuny-autologin-highlight='true']")
    ).toContainText("Allow");
  });

  test("tooltip text is visible on CUNY tab", async () => {
    await expect(
      cunyTab.locator("[data-cuny-autologin-tooltip='true']")
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      cunyTab.locator("[data-cuny-autologin-tooltip='true']")
    ).toContainText("Allow");
  });

  test("overlay does not cover the Allow button click target", async () => {
    // The Allow button must remain clickable even with the overlay active.
    await cunyTab.locator("button[onclick='allow()']").click({ timeout: 5_000 });
    expect(
      await cunyTab.evaluate(() => (window as unknown as { __e2eAllowClicked: boolean }).__e2eAllowClicked)
    ).toBe(true);
  });

  test("overlay dismisses cleanly after hide command", async () => {
    // Sidebar dismisses the overlay when the student completes the action.
    await cunyTab.locator("button[onclick='allow()']").click({ timeout: 5_000 });
    // After Allow is clicked the overlay should be gone.
    await expect(
      cunyTab.locator("[data-cuny-autologin-overlay='true']")
    ).toBeHidden({ timeout: 3_000 });
  });
});

test.describe("overlay: step chip", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(ALLOW_GATE_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("step chip is hidden when there is only one step (Allow gate)", async () => {
    // Allow overlay is a single-step action (1 of 1) — chip should be absent.
    await expect(
      cunyTab.locator("[data-cuny-autologin-highlight='true']")
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      cunyTab.locator("[data-cuny-autologin-step-chip='true']")
    ).toBeHidden();
  });
});

test.describe("overlay: TARGET_NOT_FOUND fallback", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    // Navigate to a page where the expected target element does NOT exist.
    // The overlay engine should detect missing target and emit a fallback signal.
    await cunyTab.goto(FACTORS_LIST_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("TARGET_NOT_FOUND causes sidebar to show a recovery message", async ({ page }) => {
    // The sidebar must surface a message when the overlay target is missing — never hang silently.
    await expect(
      page.locator("[data-onboarding-recovery-message='true']")
    ).toBeVisible({ timeout: 10_000 });
  });
});

// Regression: the overlay command is stored by the sidebar *after* mfaConsent
// fires the allow_gate stage. Without a polling loop the content script's
// one-shot requestAndExecuteOverlayCommand() fires before the command arrives,
// so the Allow button never gets highlighted. Verify highlight on first arrive.

test.describe("guided: allow gate overlay timing", () => {
  test("Allow button is highlighted on first arrive at mfaConsent (no second navigate)", async ({
    page,
    context,
    extensionId,
  }) => {
    // setupToAllowGate navigates to ALLOW_GATE_FIXTURE_URL exactly once and
    // waits for ALLOW_GATE — the overlay must appear WITHOUT a second navigate.
    const cunyTab = await setupToAllowGate(page, context, extensionId);
    await expect(
      cunyTab.locator("button[data-cuny-autologin-highlight='true']")
    ).toContainText("Allow", { timeout: 10_000 });
    await closeCunyTab(cunyTab);
  });
});


test.describe("guided: allow gate", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(ALLOW_GATE_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("ALLOW_GATE screen shows the click-allow body copy", async ({ page }) => {
    await expect(
      page.locator("[data-onboarding-screen='ALLOW_GATE'] .onboarding-body")
    ).toContainText("Click Allow");
    // Must NOT bleed the TOTP instruction into the Allow screen.
    await expect(
      page.locator("[data-onboarding-screen='ALLOW_GATE'] .onboarding-body")
    ).not.toContainText("six-digit code");
  });

  test("Allow button on CUNY tab gets highlighted when sidebar is in ALLOW_GATE", async () => {
    await expect(
      cunyTab.locator("button[data-cuny-autologin-highlight='true']")
    ).toContainText("Allow", { timeout: 5_000 });
  });

  test("sidebar advances past ALLOW_GATE after Allow is clicked", async ({ page }) => {
    await cunyTab.getByRole("button", { name: "Allow" }).click({ timeout: 5_000 });
    // Sidebar must leave ALLOW_GATE (transitions to ONBOARDING_OAA_SPA_HOME or GUIDED_MANAGE).
    await expect(
      page.locator("[data-onboarding-screen='ALLOW_GATE']")
    ).toBeHidden({ timeout: 10_000 });
  });

  test("Deny click stays on deny result URL and sidebar shows recovery message", async ({ page }) => {
    await cunyTab.getByRole("button", { name: "Deny" }).click({ timeout: 5_000 });
    await expect(cunyTab).toHaveURL(/error=access_denied/, { timeout: 5_000 });
    await expect(
      page.locator("[data-onboarding-recovery-message='true']")
    ).toBeVisible({ timeout: 5_000 });
  });
});


test.describe("guided: oaa-spa-home", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(ALLOW_GATE_NEXT_OAA_HOME_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("Manage button is highlighted on oaa-spa-home fixture", async () => {
    await cunyTab.getByRole("button", { name: "Allow" }).click({ timeout: 5_000 });
    await expect(
      cunyTab.locator("oj-button#createNewCategory[data-cuny-autologin-highlight='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sidebar shows loading message while waiting for factor panels", async ({ page }) => {
    await cunyTab.getByRole("button", { name: "Allow" }).click({ timeout: 5_000 });
    // While on oaa-spa-home, before factors load, sidebar should show a waiting indicator.
    await expect(
      page.locator("[data-onboarding-oaa-home-loading='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sidebar advances to GUIDED_MANAGE state when factor-panel elements appear", async ({ page }) => {
    await cunyTab.getByRole("button", { name: "Allow" }).click({ timeout: 5_000 });
    await cunyTab.locator("oj-button#createNewCategory button").click({ timeout: 5_000 });
    // After factors load (CUNY tab at ?view=factors), sidebar should enter the guided step state.
    await expect(cunyTab).toHaveURL(/view=factors/, { timeout: 15_000 });
    await expect(
      page.locator("[data-onboarding-screen='GUIDED_MANAGE']")
    ).toBeVisible({ timeout: 5_000 });
  });
});


test.describe("guided: factors-list and TOTP type selection", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(FACTORS_LIST_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("Add Authentication Factor button is highlighted in factors-list fixture", async () => {
    await expect(
      cunyTab.locator("oj-menu-button[data-cuny-autologin-highlight='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Mobile Authenticator option highlighted after Add menu opens", async () => {
    await cunyTab.locator("oj-menu-button button").click();
    await expect(
      cunyTab.locator("oj-option#ChallengeOMATOTP[data-cuny-autologin-highlight='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sidebar transitions to GUIDED_FACTOR_TYPE after TOTP type selected", async ({ page }) => {
    await cunyTab.locator("oj-menu-button button").click();
    await cunyTab.locator("oj-option#ChallengeOMATOTP").click();
    await expect(
      page.locator("[data-onboarding-screen='GUIDED_FACTOR_TYPE']")
    ).toBeVisible({ timeout: 5_000 });
  });
});


test.describe("guided: secret capture (totp-enroll-secret)", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_SECRET_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("extension fills name|input with a unique CUNYAutoLogin alias on totp-enroll-secret fixture", async () => {
    await expect(cunyTab.locator("[id='name|input']")).toHaveValue(/^CUNYAutoLogin-[0-9a-f]{4}$/i, {
      timeout: 5_000,
    });
  });

  test("Verify Now button is highlighted on totp-enroll-secret fixture", async () => {
    await expect(
      cunyTab.locator("button#verify-now-btn[data-cuny-autologin-highlight='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("secret is captured and sidebar confirms connection to CUNY account", async ({ page }) => {
    await expect(
      page.locator("[data-onboarding-secret-confirmed='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sidebar transitions to VERIFY_LOGIN_CODE when Verify Now clicked", async ({ page }) => {
    await cunyTab.locator("button#verify-now-btn").click();
    await expect(
      page.locator("[data-onboarding-screen='VERIFY_LOGIN_CODE']")
    ).toBeVisible({ timeout: 5_000 });
  });
});


test.describe("guided: five-factor limit edge case", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(FACTORS_LIST_FULL_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("overlay pauses when ChallengeOMATOTP has oj-disabled class", async () => {
    // Overlay should not highlight a disabled element; instead pause and show sidebar guidance.
    await expect(
      cunyTab.locator("oj-option#ChallengeOMATOTP[data-cuny-autologin-highlight='true']")
    ).toBeHidden({ timeout: 3_000 });
  });

  test("sidebar shows five-factor guidance message when limit is reached", async ({ page }) => {
    await expect(
      page.locator("[data-onboarding-five-factor-limit='true']")
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator("[data-onboarding-five-factor-limit='true']")
    ).toContainText("limit");
  });

  test("no auto-delete is triggered — CUNYAutoLogin factor is not removed", async () => {
    // Extension must never auto-delete a factor. The student must act manually.
    await cunyTab.waitForTimeout(2_000);
    const panels = await cunyTab.locator("factor-panel").count();
    expect(panels).toBe(5); // Still 5; nothing deleted.
  });
});


test.describe("guided: Verify Later saves as Unverified", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(FACTORS_POST_ENROLL_UNVERIFIED_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("sidebar detects unverified CUNYAutoLogin factor and shows recovery message", async ({
    page,
  }) => {
    await expect(
      page.locator("[data-onboarding-verify-later-recovery='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sidebar does not advance to SET_DEFAULT with an unverified factor", async ({ page }) => {
    await page.waitForTimeout(2_000);
    await expect(page.locator("[data-onboarding-screen='SET_DEFAULT']")).toBeHidden();
  });
});


test.describe("verify login code: OTP fill", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    // Pin the fixture's enroll secret to the test's known value so the TOTP
    // generated from the scraped secret matches our expected value.
    await cunyTab.goto(`${TOTP_ENROLL_VERIFY_FIXTURE_URL}&secret=${E2E_TOTP_SECRET}`);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("otp|input receives correct TOTP code via keystroke simulation", async () => {
    // Wait until the extension has filled a 6-digit code.
    await expect(
      cunyTab.locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`)
    ).toHaveValue(/^\d{6}$/, { timeout: 10_000 });

    const typedValue = await cunyTab
      .locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`)
      .inputValue();

    // The code must be a TOTP derived from E2E_TOTP_SECRET. Accept any of the
    // adjacent 30s windows to absorb clock-drift between extension fill time
    // and test assertion time (a boundary crossing would otherwise flake).
    const now = Date.now();
    const period = 30_000;
    const candidates = await Promise.all(
      [now - period, now, now + period].map(async (timestamp) => {
        const { otp } = await TOTP.generate(E2E_TOTP_SECRET, {
          ...TOTP_GENERATION_OPTIONS,
          timestamp,
        });
        return otp;
      })
    );
    expect(candidates).toContain(typedValue);
  });

  test("Verify and Save button is highlighted after OTP fill", async () => {
    // Wait for OTP to be filled first, then the overlay should be on the button.
    await expect(
      cunyTab.locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`)
    ).toHaveValue(/^\d{6}$/, { timeout: 10_000 });
    await expect(
      cunyTab.locator(`button[data-cuny-autologin-highlight='true']`)
    ).toContainText("Verify and Save");
  });
});


test.describe("verify login code: failure handling", () => {
  let cunyTab!: Page;

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("client-side error (empty JET model) does not trigger auto-retry", async ({
    page,
    context,
    extensionId,
  }) => {
    // client-side: otp|input value is empty when Verify and Save is clicked.
    // This means keystroke delivery failed — auto-retry would just repeat the failure.
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_VERIFY_FIXTURE_URL);

    // Manually click Verify and Save with empty input to trigger client-side error.
    await cunyTab.locator("button#verify-save-btn").click();
    await expect(
      cunyTab.locator(".oj-message-detail")
    ).toContainText("Enter a OTP code", { timeout: 3_000 });

    // Wait to confirm no retry fires (input should still be empty after the delay).
    await cunyTab.waitForTimeout(1_500);
    await expect(cunyTab.locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`)).toHaveValue("");
  });

  test("server-side error triggers one auto-regenerate: otp|input refilled", async ({
    page,
    context,
    extensionId,
  }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_VERIFY_WRONG_CODE_FIXTURE_URL);

    // Extension fills OTP, clicks Verify and Save, gets "Incorrect code", auto-retries once.
    // After the retry, otp|input should contain a fresh code.
    await expect(
      cunyTab.locator(".oj-message-detail")
    ).toContainText("Incorrect code", { timeout: 10_000 });

    // After auto-retry, input must have a new 6-digit code.
    await expect(
      cunyTab.locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`)
    ).toHaveValue(/^\d{6}$/, { timeout: 5_000 });
  });

  test("second consecutive server-side failure shows 'wait a moment' sidebar message", async ({
    page,
    context,
    extensionId,
  }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_VERIFY_WRONG_CODE_FIXTURE_URL);

    // After two failures the sidebar must surface a human-readable wait message.
    await expect(
      page.locator("[data-onboarding-verify-pause='true']")
    ).toBeVisible({ timeout: 15_000 });
  });

  test("after second failure no further auto-retry fires", async ({
    page,
    context,
    extensionId,
  }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_VERIFY_WRONG_CODE_FIXTURE_URL);

    await expect(
      page.locator("[data-onboarding-verify-pause='true']")
    ).toBeVisible({ timeout: 15_000 });

    // After the pause message appears, no more auto-fill should fire.
    const valueBefore = await cunyTab
      .locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`)
      .inputValue();
    await cunyTab.waitForTimeout(2_000);
    const valueAfter = await cunyTab
      .locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`)
      .inputValue();
    expect(valueBefore).toBe(valueAfter);
  });
});


test.describe("set as default", () => {
  let cunyTab!: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    await closeCunyTab(cunyTab);
    cunyTab = await setupToAllowGate(page, context, extensionId);
    // Stage a pending TOTP secret so handleFactorsListAfterEnroll sees a secret
    // and advances to SET_DEFAULT (the post-enroll fixture skips the enrollment flow).
    const [sw] = context.serviceWorkers();
    await sw.evaluate(
      ({ key, secret }: { key: string; secret: string }) =>
          (self as { chrome: { storage: { session: { set: (v: Record<string, string>) => Promise<void> } } } }).chrome.storage.session.set({ [key]: secret }),
      { key: PENDING_TOTP_SECRET_SESSION_KEY, secret: E2E_TOTP_SECRET }
    );
    await cunyTab.goto(FACTORS_POST_ENROLL_FIXTURE_URL);
  });

  test.afterEach(async () => {
    await closeCunyTab(cunyTab);
  });

  test("kebab menu button on CUNYAutoLogin factor row is highlighted", async () => {
    await expect(
      cunyTab.locator(".cuny-kebab button[data-cuny-autologin-highlight='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Set as Default menu item is highlighted after menu opens", async () => {
    await cunyTab.locator(".cuny-kebab button").click();
    await expect(
      cunyTab.locator("#set-default-option[data-cuny-autologin-highlight='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sidebar does NOT advance on kebab menu open alone", async ({ page }) => {
    await cunyTab.locator(".cuny-kebab button").click();
    // factorIsPreferred has not flipped yet — sidebar must stay in SET_DEFAULT.
    await page.waitForTimeout(500);
    await expect(page.locator("[data-onboarding-screen='SET_DEFAULT']")).toBeVisible();
  });

  test("sidebar advances to EXT_PASSWORD_SETUP when factorIsPreferred flips to true", async ({
    page,
  }) => {
    await cunyTab.locator(".cuny-kebab button").click();
    await cunyTab.locator("#set-default-option").click();
    // Fixture propagates the flip after ~1.2s — poll completes and sidebar advances.
    await expect(
      page.locator("[data-onboarding-screen='EXT_PASSWORD_SETUP']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sidebar advances within 2s of factorIsPreferred flip", async ({ page }) => {
    const start = Date.now();
    await cunyTab.locator(".cuny-kebab button").click();
    await cunyTab.locator("#set-default-option").click();
    await expect(
      page.locator("[data-onboarding-screen='EXT_PASSWORD_SETUP']")
    ).toBeVisible({ timeout: 4_000 });
    expect(Date.now() - start).toBeLessThan(4_000);
  });
});
