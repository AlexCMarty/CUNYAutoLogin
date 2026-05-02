/**
 * Plans 09–12: extension password, biometrics, demo, interruptions, and smoke test.
 */
import type { Page } from "@playwright/test";
import {
  ALLOW_GATE_FIXTURE_URL,
  ALLOW_GATE_NEXT_OAA_HOME_FIXTURE_URL,
  CREDENTIAL_FIXTURE_ADVANCE_URL,
  CREDENTIAL_FIXTURE_URL,
  TOTP_ENROLL_SECRET_FIXTURE_URL,
  TOTP_ENROLL_VERIFY_FIXTURE_URL,
} from "./constants";
import { expect, test } from "./extension-fixture";
import {
  clearVaultIfPossible,
  gotoPrimarySurface,
  onboardingHashWith,
  setupVault,
  walkToPasswordEntry,
} from "./helpers";

// ─── Shared setup ─────────────────────────────────────────────────────────────

async function setupToAllowGate(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  extensionId: string
): Promise<Page> {
  await page.goto(
    `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(CREDENTIAL_FIXTURE_ADVANCE_URL)}`
  );
  await walkToPasswordEntry(page);

  const tabPromise = context.waitForEvent("page");
  await page.locator("[data-onboarding-password-forward='true']").click();
  const cunyTab = await tabPromise;
  await cunyTab.waitForLoadState("domcontentloaded");
  // TOTP page fires cuny_totp_challenge → sidebar shows CUNY_TOTP.
  await expect(page.locator("[data-onboarding-screen='CUNY_TOTP']")).toBeVisible({
    timeout: 15_000,
  });
  // Navigate to mfaConsent fixture — fires allow_gate stage → CUNY_TOTP → ALLOW_GATE.
  await cunyTab.goto(ALLOW_GATE_FIXTURE_URL);
  await expect(page.locator("[data-onboarding-screen='ALLOW_GATE']")).toBeVisible({
    timeout: 10_000,
  });
  return cunyTab;
}

/**
 * Walks the sidebar all the way to EXT_PASSWORD_SETUP state by driving the
 * fixture chain: credential → TOTP → allow-gate → oaa-spa-home → factors →
 * enroll-secret → enroll-verify → post-enroll → set-default.
 * Returns the cunyTab; caller is responsible for closing it.
 */
async function setupToExtPasswordSetup(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  extensionId: string
): Promise<Page> {
  const cunyTab = await setupToAllowGate(page, context, extensionId);

  // Allow → oaa-spa-home → (student clicks Manage with overlay guidance) → factors
  await cunyTab.goto(ALLOW_GATE_NEXT_OAA_HOME_FIXTURE_URL);
  await cunyTab.getByRole("button", { name: "Allow" }).click({ timeout: 5_000 });
  await expect(cunyTab).toHaveURL(/view=factors/, { timeout: 15_000 });

  // Extension highlights TOTP option; click it → enroll-secret
  await cunyTab.locator("oj-menu-button button").click();
  await cunyTab.locator("oj-option#ChallengeOMATOTP").click();
  await expect(cunyTab).toHaveURL(/view=secret/, { timeout: 10_000 });

  // Extension fills name, highlights Verify Now; click → enroll-verify
  await cunyTab.locator("button#verify-now-btn").click();
  await expect(cunyTab).toHaveURL(/view=verify/, { timeout: 10_000 });

  // Extension fills OTP; click Verify and Save → post-enroll
  await cunyTab.locator("button#verify-save-btn").click();
  await expect(cunyTab).toHaveURL(/view=post-enroll(?!-unverified)/, { timeout: 10_000 });

  // Extension highlights kebab → Set as Default → factorIsPreferred flips → sidebar advances
  await cunyTab.locator(".cuny-kebab button").click();
  await cunyTab.locator("#set-default-option").click();
  await expect(page.locator("[data-onboarding-screen='EXT_PASSWORD_SETUP']")).toBeVisible({
    timeout: 5_000,
  });

  return cunyTab;
}

// ─── Extension password ───────────────────────────────────────────────────

test.describe("extension password: screen renders", () => {
  let cunyTab: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);
  });

  test.afterEach(async () => {
    await cunyTab.close().catch(() => {});
  });

  test("EXT_PASSWORD_SETUP screen renders with two password inputs", async ({ page }) => {
    await expect(page.locator("[data-onboarding-screen='EXT_PASSWORD_SETUP']")).toBeVisible();
    await expect(page.locator("[data-onboarding-ext-password-input='true']")).toBeVisible();
    await expect(page.locator("[data-onboarding-ext-password-confirm='true']")).toBeVisible();
  });

  test("forward button disabled when strength is Weak", async ({ page }) => {
    await page.locator("[data-onboarding-ext-password-input='true']").fill("abc");
    await expect(page.locator("[data-onboarding-ext-password-forward='true']")).toBeDisabled();
    await expect(page.locator("[data-onboarding-ext-password-strength='true']")).toContainText(
      "Weak"
    );
  });

  test("strength indicator shows Fair at minimum acceptable password", async ({ page }) => {
    await page.locator("[data-onboarding-ext-password-input='true']").fill("Passw0rd!");
    await expect(page.locator("[data-onboarding-ext-password-strength='true']")).toContainText(
      "Fair"
    );
  });

  test("strength indicator shows Strong for a complex passphrase", async ({ page }) => {
    await page
      .locator("[data-onboarding-ext-password-input='true']")
      .fill("CorrectHorseBatteryStaple42!");
    await expect(page.locator("[data-onboarding-ext-password-strength='true']")).toContainText(
      "Strong"
    );
  });

  test("forward button disabled when passwords do not match", async ({ page }) => {
    await page.locator("[data-onboarding-ext-password-input='true']").fill("Passw0rd!");
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill("Different!");
    await expect(page.locator("[data-onboarding-ext-password-forward='true']")).toBeDisabled();
  });

  test("forward button enabled when strength is Fair and both fields match", async ({ page }) => {
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await expect(page.locator("[data-onboarding-ext-password-forward='true']")).toBeEnabled();
  });

  test("confirm field shows match indicator when both fields are equal", async ({ page }) => {
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await expect(
      page.locator("[data-onboarding-ext-password-match-indicator='true']")
    ).toBeVisible();
    await expect(
      page.locator("[data-onboarding-ext-password-match-indicator='true']")
    ).toHaveAttribute("data-match-ok", "true");
  });

  test("confirm field shows mismatch indicator while passwords differ", async ({ page }) => {
    await page.locator("[data-onboarding-ext-password-input='true']").fill("Passw0rd!");
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill("Passw0rd");
    await expect(
      page.locator("[data-onboarding-ext-password-match-indicator='true']")
    ).toHaveAttribute("data-match-ok", "false");
  });

  test("submitting advances to BIOMETRIC_OFFER or COMPLETE_DEMO", async ({ page }) => {
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();
    // Lands on biometric offer if platform authenticator available, else COMPLETE_DEMO.
    const nextScreen = page.locator(
      "[data-onboarding-screen='BIOMETRIC_OFFER'], [data-onboarding-screen='COMPLETE_DEMO']"
    );
    await expect(nextScreen).toBeVisible({ timeout: 5_000 });
  });

  test("show/hide toggle reveals and re-hides the password field", async ({ page }) => {
    const pwInput = page.locator("[data-onboarding-ext-password-input='true']");
    const pwToggle = page.locator("[data-onboarding-ext-password-toggle='true']");
    await expect(pwInput).toHaveAttribute("type", "password");
    await pwToggle.click();
    await expect(pwInput).toHaveAttribute("type", "text");
    await pwToggle.click();
    await expect(pwInput).toHaveAttribute("type", "password");
  });

  test("show/hide toggle on confirm field reveals and re-hides it", async ({ page }) => {
    const confirmInput = page.locator("[data-onboarding-ext-password-confirm='true']");
    const confirmToggle = page.locator("[data-onboarding-ext-password-confirm-toggle='true']");
    await expect(confirmInput).toHaveAttribute("type", "password");
    await confirmToggle.click();
    await expect(confirmInput).toHaveAttribute("type", "text");
    await confirmToggle.click();
    await expect(confirmInput).toHaveAttribute("type", "password");
  });

  test("Enter in first field moves focus to confirm field", async ({ page }) => {
    const confirmInput = page.locator("[data-onboarding-ext-password-confirm='true']");
    await page.locator("[data-onboarding-ext-password-input='true']").fill("Passw0rd!");
    await page.locator("[data-onboarding-ext-password-input='true']").press("Enter");
    await expect(confirmInput).toBeFocused();
  });

  test("Enter in confirm field with matching passwords submits", async ({ page }) => {
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").press("Enter");
    const nextScreen = page.locator(
      "[data-onboarding-screen='BIOMETRIC_OFFER'], [data-onboarding-screen='COMPLETE_DEMO']"
    );
    await expect(nextScreen).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Biometrics and demo ──────────────────────────────────────────────────

test.describe("biometrics offer", () => {
  let cunyTab: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);
    // Advance past extension password setup.
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();
  });

  test.afterEach(async () => {
    await cunyTab.close().catch(() => {});
  });

  test("'Type my password each time' advances directly to COMPLETE_DEMO", async ({ page }) => {
    // Skip biometrics (or land directly at COMPLETE_DEMO if platform auth unavailable).
    const skipBtn = page.locator("[data-onboarding-biometric-skip='true']");
    if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await expect(
      page.locator("[data-onboarding-screen='COMPLETE_DEMO']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("biometric prep screen shown before system dialog triggers", async ({ page }) => {
    const useBtn = page.locator("[data-onboarding-biometric-use='true']");
    if (!(await useBtn.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip(); // No platform authenticator available in this environment.
      return;
    }
    await useBtn.click();
    await expect(
      page.locator("[data-onboarding-screen='BIOMETRIC_PREP']")
    ).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("completion and demo", () => {
  let cunyTab: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();
    // Skip biometrics if shown.
    const skipBtn = page.locator("[data-onboarding-biometric-skip='true']");
    if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await expect(
      page.locator("[data-onboarding-screen='COMPLETE_DEMO']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test.afterEach(async () => {
    await cunyTab.close().catch(() => {});
  });

  test("COMPLETE_DEMO screen renders 'You're all set!' headline", async ({ page }) => {
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DEMO']")).toContainText(
      "You're all set!"
    );
  });

  test("'Skip' link advances to COMPLETE_DONE without opening a new CUNY tab", async ({
    page,
    context,
  }) => {
    const pagesBefore = context.pages().length;
    await page.locator("[data-onboarding-demo-skip='true']").click();
    await expect(
      page.locator("[data-onboarding-screen='COMPLETE_DONE']")
    ).toBeVisible({ timeout: 5_000 });
    expect(context.pages().length).toBe(pagesBefore);
  });

  test("'Show me' opens a new CUNY tab and begins autofill narration", async ({
    page,
    context,
  }) => {
    const tabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-demo-show='true']").click();
    const demoTab = await tabPromise;
    await demoTab.waitForLoadState("domcontentloaded");
    // Sidebar should show narration status during the demo.
    await expect(
      page.locator("[data-onboarding-demo-status='true']")
    ).toBeVisible({ timeout: 10_000 });
    await demoTab.close();
  });

  test("COMPLETE_DONE renders with no back button and no forward button", async ({ page }) => {
    await page.locator("[data-onboarding-demo-skip='true']").click();
    await expect(
      page.locator("[data-onboarding-screen='COMPLETE_DONE']")
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-onboarding-back='true']")).toBeHidden();
    await expect(page.locator("[data-onboarding-forward='true']")).toBeHidden();
  });
});

// ─── Interruptions ────────────────────────────────────────────────────────

test.describe("interruption: CUNY tab closed mid-flow", () => {
  test("'Reopen CUNY tab' button appears in sidebar when CUNY tab is closed during guided steps", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_SECRET_FIXTURE_URL);
    // Close the CUNY tab mid-flow.
    await cunyTab.close();
    await expect(
      page.locator("[data-onboarding-reopen-cuny='true']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("clicking 'Reopen CUNY tab' opens a new CUNY tab at correct URL", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_SECRET_FIXTURE_URL);
    await cunyTab.close();

    await expect(
      page.locator("[data-onboarding-reopen-cuny='true']")
    ).toBeVisible({ timeout: 5_000 });

    const newTabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-reopen-cuny='true']").click();
    const newTab = await newTabPromise;
    await newTab.waitForLoadState("domcontentloaded");
    // The reopened tab should return to CUNY SSO entry flow.
    expect(newTab.url()).toContain("ssologin.cuny.edu");
    await newTab.close();
  });

  test("'Reopen CUNY tab' button is absent while CUNY tab is still open", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_SECRET_FIXTURE_URL);
    // Tab is still open — button must not appear.
    await page.waitForTimeout(1_000);
    await expect(page.locator("[data-onboarding-reopen-cuny='true']")).toBeHidden();
    await cunyTab.close();
  });
});

test.describe("interruption: sidebar close and resume", () => {
  test("reopening sidebar mid-flow shows resume prompt", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_VERIFY_FIXTURE_URL);

    // Navigate the sidebar away (simulates sidebar close by going to a blank page).
    await page.goto("about:blank");
    // Reopen the sidebar.
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(CREDENTIAL_FIXTURE_ADVANCE_URL)}`
    );

    // Should see a resume prompt (not the Welcome screen).
    await expect(
      page.locator("[data-onboarding-resume='true']")
    ).toBeVisible({ timeout: 5_000 });
    await cunyTab.close();
  });

  test("resume CTA returns to the last completed step, not Welcome", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_SECRET_FIXTURE_URL);

    await page.goto("about:blank");
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(CREDENTIAL_FIXTURE_ADVANCE_URL)}`
    );

    await page.locator("[data-onboarding-resume='true']").click();
    // Must not be back at WELCOME.
    await expect(page.locator("[data-onboarding-screen='WELCOME']")).toBeHidden();
    await cunyTab.close();
  });
});

test.describe("interruption: browser restart reset behavior", () => {
  test("cleared session context returns onboarding to WELCOME without resume CTA", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await setupToAllowGate(page, context, extensionId);
    await cunyTab.goto(TOTP_ENROLL_SECRET_FIXTURE_URL);

    await page.goto("about:blank");
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(CREDENTIAL_FIXTURE_ADVANCE_URL)}`
    );
    await page.evaluate(async () => {
      const extensionChrome = (globalThis as { chrome?: unknown }).chrome as
        | { storage?: { session?: { clear: (callback?: () => void) => void } } }
        | undefined;
      const sessionArea = extensionChrome?.storage?.session;
      if (sessionArea?.clear) {
        await new Promise<void>((resolve) => {
          sessionArea.clear(() => resolve());
        });
      }
    });
    await page.goto("about:blank");
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(CREDENTIAL_FIXTURE_ADVANCE_URL)}`
    );

    await expect(page.locator("[data-onboarding-screen='WELCOME']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("[data-onboarding-resume='true']")).toBeHidden();
    await cunyTab.close();
  });
});

// ─── Hardening ────────────────────────────────────────────────────────────

test.describe("hardening: selector timeout recovery", () => {
  test("TARGET_NOT_FOUND causes sidebar to show recovery message, not hang", async ({
    page,
    context,
    extensionId,
  }) => {
    // Load a CUNY fixture page that lacks the expected target element.
    // The overlay engine should time out and emit TARGET_NOT_FOUND.
    const cunyTab = await setupToAllowGate(page, context, extensionId);
    // Navigate to a page with no Allow button — will trigger timeout fallback.
    await cunyTab.goto(CREDENTIAL_FIXTURE_URL);

    await expect(
      page.locator("[data-onboarding-recovery-message='true']")
    ).toBeVisible({ timeout: 15_000 });
    await cunyTab.close();
  });
});

test.describe("post-onboarding: vault UI after completion", () => {
  let cunyTab: Page | undefined;

  test.beforeEach(async ({ page, context, extensionId }) => {
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();
    const skipBtn = page.locator("[data-onboarding-biometric-skip='true']");
    if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DEMO']")).toBeVisible({
      timeout: 5_000,
    });
    await page.locator("[data-onboarding-demo-skip='true']").click();
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DONE']")).toBeVisible({
      timeout: 5_000,
    });
  });

  test.afterEach(async () => {
    await cunyTab?.close().catch(() => {});
  });

  test("reload sidebar without onboarding hash shows vault form not WELCOME", async ({
    page,
    extensionId,
  }) => {
    // Unload may not run onboarding unmount; a resumable snapshot (e.g. COMPLETE_DEMO) can
    // otherwise force the onboarding branch and skip sidebar-management + TOTP hide CSS.
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const extensionChrome = (globalThis as { chrome?: unknown }).chrome as
          | { storage?: { session?: { remove: (keys: string, cb?: () => void) => void } } }
          | undefined;
        const sessionArea = extensionChrome?.storage?.session;
        if (sessionArea?.remove) {
          sessionArea.remove("cunyOnboardingResumeSnapshot", () => {
            sessionArea.remove("cunyOnboardingResumeSnapshotV1", () => resolve());
          });
        } else {
          resolve();
        }
      });
    });

    await page.goto(`chrome-extension://${extensionId}/sidebar.html`);
    await expect(page.locator("#vault-form")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-onboarding-welcome-cta='true']")).toHaveCount(0);
    await expect(page.locator("body[data-vault-ui='sidebar-management']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#totp-secret-field")).toBeHidden();
  });
});

test.describe("smoke: full happy path Screen 1 → Screen 13", () => {
  test("complete onboarding from WELCOME to COMPLETE_DONE on fixtures end-to-end", async ({
    page,
    context,
    extensionId,
  }) => {
    // ── Setup ─────────────────────────────────────────────────────────────────
    await gotoPrimarySurface(page, extensionId);
    await clearVaultIfPossible(page);
    await setupVault(page);
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(CREDENTIAL_FIXTURE_ADVANCE_URL)}`
    );

    // ── Screens 1-3 ──────────────────────────────────────────────────────────
    await walkToPasswordEntry(page);

    // ── Screen 4 → CUNY_TOTP → ALLOW_GATE ───────────────────────────────────
    const tabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-password-forward='true']").click();
    const cunyTab = await tabPromise;
    await cunyTab.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-onboarding-screen='CUNY_TOTP']")).toBeVisible({
      timeout: 15_000,
    });
    await cunyTab.goto(ALLOW_GATE_NEXT_OAA_HOME_FIXTURE_URL);
    await expect(page.locator("[data-onboarding-screen='ALLOW_GATE']")).toBeVisible({
      timeout: 10_000,
    });

    // ── Allow gate → oaa-spa-home → factors-list ─────────────────────────────
    await cunyTab.getByRole("button", { name: "Allow" }).click({ timeout: 5_000 });
    await expect(cunyTab).toHaveURL(/view=factors/, { timeout: 15_000 });

    // ── factors-list → enroll-secret ─────────────────────────────────────────
    await cunyTab.locator("oj-menu-button button").click();
    await cunyTab.locator("oj-option#ChallengeOMATOTP").click();
    await expect(cunyTab).toHaveURL(/view=secret/, { timeout: 10_000 });

    // ── enroll-secret → enroll-verify ────────────────────────────────────────
    await cunyTab.locator("button#verify-now-btn").click();
    await expect(cunyTab).toHaveURL(/view=verify/, { timeout: 10_000 });

    // ── enroll-verify → post-enroll ──────────────────────────────────────────
    await cunyTab.locator("button#verify-save-btn").click();
    await expect(cunyTab).toHaveURL(/view=post-enroll(?!-unverified)/, { timeout: 10_000 });

    // ── Set as Default → EXT_PASSWORD_SETUP ──────────────────────────────────
    await cunyTab.locator(".cuny-kebab button").click();
    await cunyTab.locator("#set-default-option").click();
    await expect(page.locator("[data-onboarding-screen='EXT_PASSWORD_SETUP']")).toBeVisible({
      timeout: 5_000,
    });

    // ── Extension password ────────────────────────────────────────────────────
    const pw = "SmokeTestPw99!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();

    // ── Skip biometrics if offered ────────────────────────────────────────────
    const skipBio = page.locator("[data-onboarding-biometric-skip='true']");
    if (await skipBio.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skipBio.click();
    }

    // ── COMPLETE_DEMO → COMPLETE_DONE ────────────────────────────────────────
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DEMO']")).toBeVisible({
      timeout: 5_000,
    });
    await page.locator("[data-onboarding-demo-skip='true']").click();
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DONE']")).toBeVisible({
      timeout: 5_000,
    });

    await cunyTab.close();
  });
});
