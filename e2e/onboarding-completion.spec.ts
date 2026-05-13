/**
 * E2E coverage for extension password, biometrics, demo flow, interruptions, and smoke paths.
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
import {
  BRIGHTSPACE_HOME_URL,
  SSO_LOGIN_HOST,
  SSO_LOGIN_ORIGIN,
  WEBAUTHN_RP_ID,
} from "../src/cuny/ssoSite";
import { expect, test } from "./extension-fixture";
import {
  lockVault,
  onboardingHashWith,
  walkToPasswordEntry,
} from "./helpers";
import {
  addVirtualPlatformAuthenticator,
  type VirtualPlatformAuthenticator,
} from "./webauthnVirtualAuthenticator";

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
  await expect(page.locator("[data-onboarding-screen='CUNY_TOTP']")).toBeVisible({
    timeout: 15_000,
  });
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

  // Fixture HTML encodes the Oracle RUI happy path; each step mirrors overlay-guided clicks.
  await cunyTab.goto(ALLOW_GATE_NEXT_OAA_HOME_FIXTURE_URL);
  await cunyTab.getByRole("button", { name: "Allow" }).click({ timeout: 5_000 });
  await expect(cunyTab).toHaveURL(/view=factors/, { timeout: 15_000 });

  await cunyTab.locator("oj-menu-button button").click();
  await cunyTab.locator("oj-option#ChallengeOMATOTP").click();
  await expect(cunyTab).toHaveURL(/view=secret/, { timeout: 10_000 });

  await cunyTab.locator("button#verify-now-btn").click();
  await expect(cunyTab).toHaveURL(/view=verify/, { timeout: 10_000 });

  await cunyTab.locator("button#verify-save-btn").click();
  await expect(cunyTab).toHaveURL(/view=post-enroll(?!-unverified)/, { timeout: 10_000 });

  await cunyTab.locator(".cuny-kebab button").click();
  await cunyTab.locator("#set-default-option").click();
  await expect(page.locator("[data-onboarding-screen='EXT_PASSWORD_SETUP']")).toBeVisible({
    timeout: 5_000,
  });

  return cunyTab;
}

// eslint-disable-next-line max-lines-per-function
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


// eslint-disable-next-line max-lines-per-function
test.describe("biometrics offer", () => {
  let cunyTab: Page;
  let authenticator: VirtualPlatformAuthenticator;

  test.beforeEach(async ({ page, context, extensionId }) => {
    // Install the virtual platform authenticator before any WebAuthn capability
    // check fires — biometricOffer.ts auto-declines on
    // isUserVerifyingPlatformAuthenticatorAvailable() === false. The
    // authenticator is bound to the sidebar page WebContents and survives
    // subsequent goto() calls inside setupToExtPasswordSetup.
    authenticator = await addVirtualPlatformAuthenticator(page);
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);
    // Advance past extension password setup.
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();
  });

  test.afterEach(async () => {
    await authenticator?.remove();
    await cunyTab.close().catch(() => {});
  });

  test("BIOMETRIC_OFFER renders the use and skip buttons when a platform authenticator is available", async ({
    page,
  }) => {
    await expect(page.locator("[data-onboarding-screen='BIOMETRIC_OFFER']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("[data-onboarding-biometric-use='true']")).toBeVisible();
    await expect(page.locator("[data-onboarding-biometric-skip='true']")).toBeVisible();
  });

  test("'Type my password each time' advances directly to COMPLETE_DEMO", async ({ page }) => {
    await page.locator("[data-onboarding-biometric-skip='true']").click();
    await expect(
      page.locator("[data-onboarding-screen='COMPLETE_DEMO']")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("biometric prep screen shown before system dialog triggers", async ({ page }) => {
    await page.locator("[data-onboarding-biometric-use='true']").click();
    await expect(
      page.locator("[data-onboarding-screen='BIOMETRIC_PREP']")
    ).toBeVisible({ timeout: 3_000 });
  });

  test("'Go back' on BIOMETRIC_PREP returns to BIOMETRIC_OFFER", async ({ page }) => {
    await page.locator("[data-onboarding-biometric-use='true']").click();
    await expect(page.locator("[data-onboarding-screen='BIOMETRIC_PREP']")).toBeVisible({
      timeout: 3_000,
    });
    await page.locator("[data-onboarding-screen='BIOMETRIC_PREP'] [data-onboarding-back='true']")
      .click();
    await expect(page.locator("[data-onboarding-screen='BIOMETRIC_OFFER']")).toBeVisible({
      timeout: 3_000,
    });
    await expect(page.locator("[data-onboarding-biometric-use='true']")).toBeVisible();
  });

  test("enrollment success persists cunyBiometricCredential and advances to COMPLETE_DEMO", async ({
    page,
  }) => {
    await page.locator("[data-onboarding-biometric-use='true']").click();
    await expect(page.locator("[data-onboarding-screen='BIOMETRIC_PREP']")).toBeVisible({
      timeout: 3_000,
    });
    // The CUNY tab opens during onboarding setup and steals focus; WebAuthn
    // refuses ceremonies on an unfocused page ("The operation is not allowed
    // at this time because the page does not have focus.").
    await page.bringToFront();
    await page
      .locator("[data-onboarding-screen='BIOMETRIC_PREP'] [data-onboarding-biometric-prep-continue='true']")
      .click();
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DEMO']")).toBeVisible({
      timeout: 10_000,
    });

    const stored = await page.evaluate(
      () =>
        new Promise<unknown>((resolve) => {
          chrome.storage.local.get("cunyBiometricCredential", (items) => {
            resolve(items.cunyBiometricCredential);
          });
        })
    );
    expect(stored).toMatchObject({
      version: 1,
      credentialIdB64: expect.any(String),
      prfSaltB64: expect.any(String),
      ivB64: expect.any(String),
      wrappedMasterB64: expect.any(String),
    });
    const credentials = await authenticator.getCredentials();
    expect(credentials.length).toBe(1);
    expect(credentials[0]?.rpId).toBe(WEBAUTHN_RP_ID);
  });
});

test.describe("biometrics prep: failure paths", () => {
  let cunyTab: Page;
  let authenticator: VirtualPlatformAuthenticator;

  test.afterEach(async () => {
    await authenticator?.remove();
    await cunyTab?.close().catch(() => {});
  });

  test("PRF-less authenticator surfaces the unsupported message and 'Continue anyway' completes onboarding", async ({
    page,
    context,
    extensionId,
  }) => {
    authenticator = await addVirtualPlatformAuthenticator(page, { hasPrf: false });
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();

    await page.locator("[data-onboarding-biometric-use='true']").click();
    const prep = page.locator("[data-onboarding-screen='BIOMETRIC_PREP']");
    await expect(prep).toBeVisible({ timeout: 3_000 });

    // WebAuthn ceremonies require the sidebar tab to be focused; the CUNY
    // fixture tab opened during setup steals focus otherwise.
    await page.bringToFront();
    const continueBtn = prep.locator("[data-onboarding-biometric-prep-continue='true']");
    await continueBtn.click();

    // With hasPrf: false, enrollBiometric maps the missing PRF result to
    // 'prf_unavailable' (no PRF in create() ext results, then a second get()
    // also returns no PRF — see src/crypto/biometric.ts prfViaGet). The prep
    // screen surfaces the unsupported copy and switches the CTA to fallback.
    await expect(prep.locator(".onboarding-subtext")).toContainText(
      "doesn’t support biometric unlock",
      { timeout: 15_000 }
    );
    await expect(continueBtn).toHaveText("Continue anyway");

    const stored = await page.evaluate(
      () =>
        new Promise<unknown>((resolve) => {
          chrome.storage.local.get("cunyBiometricCredential", (items) => {
            resolve(items.cunyBiometricCredential);
          });
        })
    );
    expect(stored).toBeUndefined();

    await continueBtn.click();
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DEMO']")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("user-verification failure shows the retry message and leaves Continue enabled", async ({
    page,
    context,
    extensionId,
  }) => {
    authenticator = await addVirtualPlatformAuthenticator(page);
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();

    await page.locator("[data-onboarding-biometric-use='true']").click();
    const prep = page.locator("[data-onboarding-screen='BIOMETRIC_PREP']");
    await expect(prep).toBeVisible({ timeout: 3_000 });

    // Force the next create() ceremony to fail user verification, which the
    // platform surfaces as NotAllowedError → mapped to 'user_cancelled' in
    // src/crypto/biometric.ts.
    await authenticator.setUserVerified(false);

    await page.bringToFront();
    const continueBtn = prep.locator("[data-onboarding-biometric-prep-continue='true']");
    await continueBtn.click();

    // biometricPrep distinguishes user_cancelled from prf_unavailable: the
    // CTA keeps its original label and stays clickable so the user can retry.
    await expect(prep.locator(".onboarding-subtext")).toContainText(
      "Didn't catch that",
      { timeout: 15_000 }
    );
    await expect(continueBtn).toHaveText("Continue");
    await expect(continueBtn).toBeEnabled();
    const creds = await authenticator.getCredentials();
    expect(creds.length).toBe(0);
  });
});

test.describe("biometrics offer without virtual authenticator", () => {
  let cunyTab: Page;

  test.beforeEach(async ({ page, context, extensionId }) => {
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);
    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();
  });

  test.afterEach(async () => {
    await cunyTab.close().catch(() => {});
  });

  test("offer auto-declines to COMPLETE_DEMO when no platform authenticator is available", async ({
    page,
  }) => {
    // No virtual authenticator attached — headless Chromium reports
    // isUserVerifyingPlatformAuthenticatorAvailable() === false, so the offer
    // screen dispatches BIOMETRIC_DECLINED before the buttons render.
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DEMO']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("[data-onboarding-biometric-use='true']")).toHaveCount(0);
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

  test(`COMPLETE_DEMO screen renders "You're all set." headline`, async ({ page }) => {
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DEMO']")).toContainText(
      "You're all set."
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

  test("'Show me' opens Brightspace and begins autofill narration", async ({
    page,
    context,
  }) => {
    const tabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-demo-show='true']").click();
    const demoTab = await tabPromise;
    await demoTab.waitForLoadState("domcontentloaded");
    await expect
      .poll(() => demoTab.url(), { timeout: 10_000 })
      .toMatch(
        new RegExp(`^(?:${BRIGHTSPACE_HOME_URL}|${SSO_LOGIN_ORIGIN}/oam/server/auth_cred_submit)`)
      );
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
    expect(newTab.url()).toContain(SSO_LOGIN_HOST);
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
          sessionArea.remove("cunyOnboardingResumeSnapshot", () => resolve());
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

// eslint-disable-next-line max-lines-per-function
test.describe("biometric unlock after enrollment", () => {
  let cunyTab: Page;
  let authenticator: VirtualPlatformAuthenticator;

  test.afterEach(async () => {
    await authenticator?.remove();
    await cunyTab?.close().catch(() => {});
  });

  test("locked vault unlocks via the biometric button without typing the master password", async ({
    page,
    context,
    extensionId,
  }) => {
    // Install the virtual platform authenticator on the sidebar tab; it
    // survives the goto() inside setupToExtPasswordSetup and the eventual
    // reload that mounts the vault management UI.
    authenticator = await addVirtualPlatformAuthenticator(page);
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);

    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();

    // Enroll biometric so cunyBiometricCredential lands in storage.local.
    await page.locator("[data-onboarding-biometric-use='true']").click();
    await expect(page.locator("[data-onboarding-screen='BIOMETRIC_PREP']")).toBeVisible({
      timeout: 3_000,
    });
    await page.bringToFront();
    await page
      .locator(
        "[data-onboarding-screen='BIOMETRIC_PREP'] [data-onboarding-biometric-prep-continue='true']"
      )
      .click();
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DEMO']")).toBeVisible({
      timeout: 10_000,
    });
    await page.locator("[data-onboarding-demo-skip='true']").click();
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DONE']")).toBeVisible({
      timeout: 5_000,
    });

    // Reload sidebar without the onboarding resume snapshot so the vault
    // controller mounts in management mode. Same pattern the post-onboarding
    // describe block uses above.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const extensionChrome = (globalThis as { chrome?: unknown }).chrome as
            | { storage?: { session?: { remove: (keys: string, cb?: () => void) => void } } }
            | undefined;
          const sessionArea = extensionChrome?.storage?.session;
          if (sessionArea?.remove) {
            sessionArea.remove("cunyOnboardingResumeSnapshot", () => resolve());
          } else {
            resolve();
          }
        })
    );
    await page.goto(`chrome-extension://${extensionId}/sidebar.html`);
    await expect(page.locator("#vault-status-bar")).toBeVisible({ timeout: 10_000 });

    await lockVault(page);
    const bioBtn = page.locator("#biometric-unlock-btn");
    await expect(bioBtn).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("#masterPassword")).toHaveValue("");

    await bioBtn.click();

    // Successful unlock re-renders the status bar and hides the locked header.
    await expect(page.locator("#vault-status-bar")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#vault-locked-header")).toBeHidden();
    await expect(page.locator("#masterPassword")).toHaveValue("");
  });

  test("biometric button stays hidden when no credential is enrolled", async ({
    page,
    context,
    extensionId,
  }) => {
    // Same flow but skip the enrollment step — no cunyBiometricCredential is
    // written, so isBiometricEnrolled() returns false and the unlock button
    // must remain hidden after lock.
    authenticator = await addVirtualPlatformAuthenticator(page);
    cunyTab = await setupToExtPasswordSetup(page, context, extensionId);

    const pw = "Passw0rd!";
    await page.locator("[data-onboarding-ext-password-input='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-confirm='true']").fill(pw);
    await page.locator("[data-onboarding-ext-password-forward='true']").click();

    await page.locator("[data-onboarding-biometric-skip='true']").click();
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DEMO']")).toBeVisible({
      timeout: 5_000,
    });
    await page.locator("[data-onboarding-demo-skip='true']").click();
    await expect(page.locator("[data-onboarding-screen='COMPLETE_DONE']")).toBeVisible({
      timeout: 5_000,
    });

    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const extensionChrome = (globalThis as { chrome?: unknown }).chrome as
            | { storage?: { session?: { remove: (keys: string, cb?: () => void) => void } } }
            | undefined;
          const sessionArea = extensionChrome?.storage?.session;
          if (sessionArea?.remove) {
            sessionArea.remove("cunyOnboardingResumeSnapshot", () => resolve());
          } else {
            resolve();
          }
        })
    );
    await page.goto(`chrome-extension://${extensionId}/sidebar.html`);
    await expect(page.locator("#vault-status-bar")).toBeVisible({ timeout: 10_000 });

    await lockVault(page);
    await expect(page.locator("#biometric-unlock-btn")).toBeHidden();
  });
});
