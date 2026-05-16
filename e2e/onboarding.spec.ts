import { TOTP } from "totp-generator";
import {
  RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID,
  TOTP_GENERATION_OPTIONS,
} from "../src/cuny/ssoSite";
import {
  CREDENTIAL_ERROR_FIXTURE_URL,
  CREDENTIAL_FIXTURE_ADVANCE_URL,
  CREDENTIAL_FIXTURE_URL,
  CREDENTIAL_FIXTURE_WRONG_INLINE_URL,
  CREDENTIAL_FIXTURE_WRONG_REDIRECT_URL,
  FIXTURE_ORIGIN,
  SELF_SERVICE_FIXTURE_URL,
} from "./constants";
import { expect, test } from "./extension-fixture";
import { onboardingHashWith, setupVault, walkToCunyTotp, walkToPasswordEntry } from "./helpers";
import { E2E_EMAIL, E2E_PASSWORD, E2E_TOTP_SECRET } from "./test-credentials";
import { CREDENTIAL_ERROR_BANNER_ID } from "../src/content/banner";

const ONBOARDING_HASH = "#onboarding=1";

// These specs use the dev-only `#onboarding=1` hash; `build:e2e` runs in development
// mode so that branch stays enabled (see `src/sidebar/sidebar.ts`).
// eslint-disable-next-line max-lines-per-function
test.describe("onboarding screens 1-3", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidebar.html${ONBOARDING_HASH}`);
  });

  test("mounts bead header + welcome screen when #onboarding=1 is present", async ({ page }) => {
    await expect(page.locator("#onboarding-root")).toBeVisible();
    await expect(page.locator("main.vault-wrap")).toBeHidden();

    const beads = page.locator("[data-onboarding-bead='true']");
    await expect(beads).toHaveCount(5);
    await expect(beads.nth(0)).toContainText("Your info");
    await expect(beads.nth(0)).toHaveAttribute("data-bead-status", "active");

    await expect(
      page.locator("[data-onboarding-screen='WELCOME']")
    ).toBeVisible();
    await expect(
      page.locator("[data-onboarding-welcome-cta='true']")
    ).toHaveText("Let's set it up");
    await expect(
      page.locator("[data-onboarding-welcome-reassurance='true']")
    ).toContainText("locked behind a password only you know");
  });

  test("forward path Welcome → Email → Password; bead 1 stays active", async ({ page }) => {
    await page.locator("[data-onboarding-welcome-cta='true']").click();
    await expect(
      page.locator("[data-onboarding-screen='EMAIL_ENTRY']")
    ).toBeVisible();

    const emailInput = page.locator("[data-onboarding-email-input='true']");
    const emailForward = page.locator("[data-onboarding-email-forward='true']");
    await emailInput.fill(E2E_EMAIL);
    await expect(emailForward).toBeEnabled();
    await emailForward.click();

    await expect(
      page.locator("[data-onboarding-screen='PASSWORD_ENTRY']")
    ).toBeVisible();
    await expect(
      page.locator("[data-onboarding-bead='true']").nth(0)
    ).toHaveAttribute("data-bead-status", "active");
  });

  test("invalid email domain disables Continue and shows inline hint on blur", async ({ page }) => {
    await page.locator("[data-onboarding-welcome-cta='true']").click();

    const emailInput = page.locator("[data-onboarding-email-input='true']");
    const emailForward = page.locator("[data-onboarding-email-forward='true']");
    const hint = page.locator("[data-onboarding-email-hint='true']");

    const setEmailValue = async (value: string): Promise<void> => {
      await emailInput.evaluate((node, nextValue) => {
        const input = node as HTMLInputElement;
        input.value = nextValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    };

    await setEmailValue("jane.doe@baruchmail.cuny.edu");
    await expect(emailForward).toBeDisabled();
    await emailInput.blur();
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("CUNY logins end in @login.cuny.edu");

    await setEmailValue(E2E_EMAIL);
    await emailInput.blur();
    await expect(emailForward).toBeEnabled();
    await emailForward.click();
    await expect(
      page.locator("[data-onboarding-screen='PASSWORD_ENTRY']")
    ).toBeVisible();
  });

  test("password screen: show/hide toggle and non-empty gating", async ({ page }) => {
    await page.locator("[data-onboarding-welcome-cta='true']").click();
    await page
      .locator("[data-onboarding-email-input='true']")
      .fill(E2E_EMAIL);
    await page.locator("[data-onboarding-email-forward='true']").click();

    const pwInput = page.locator("[data-onboarding-password-input='true']");
    const pwForward = page.locator("[data-onboarding-password-forward='true']");
    const pwToggle = page.locator("[data-onboarding-password-toggle='true']");

    await expect(pwInput).toHaveAttribute("type", "password");
    await expect(pwForward).toBeDisabled();

    await pwInput.fill("brightspace-pw");
    await expect(pwForward).toBeEnabled();

    await pwToggle.click();
    await expect(pwInput).toHaveAttribute("type", "text");
    await pwToggle.click();
    await expect(pwInput).toHaveAttribute("type", "password");
  });

  test("back from Screen 3 returns to Screen 2 with email preserved", async ({ page }) => {
    await page.locator("[data-onboarding-welcome-cta='true']").click();
    await page
      .locator("[data-onboarding-email-input='true']")
      .fill("returning@login.cuny.edu");
    await page.locator("[data-onboarding-email-forward='true']").click();

    await expect(
      page.locator("[data-onboarding-screen='PASSWORD_ENTRY']")
    ).toBeVisible();

    await page.locator("[data-onboarding-password-back='true']").click();
    await expect(
      page.locator("[data-onboarding-screen='EMAIL_ENTRY']")
    ).toBeVisible();
    await expect(
      page.locator("[data-onboarding-email-input='true']")
    ).toHaveValue("returning@login.cuny.edu");
  });

  test("back from Screen 2 returns to Welcome", async ({ page }) => {
    await page.locator("[data-onboarding-welcome-cta='true']").click();
    await page.locator("[data-onboarding-email-back='true']").click();
    await expect(
      page.locator("[data-onboarding-screen='WELCOME']")
    ).toBeVisible();
  });

  test("Enter on email field advances to PASSWORD_ENTRY", async ({ page }) => {
    await page.locator("[data-onboarding-welcome-cta='true']").click();
    await page.locator("[data-onboarding-email-input='true']").fill(E2E_EMAIL);
    await page.locator("[data-onboarding-email-input='true']").press("Enter");
    await expect(
      page.locator("[data-onboarding-screen='PASSWORD_ENTRY']")
    ).toBeVisible();
  });

  test("Enter on invalid email does not advance", async ({ page }) => {
    await page.locator("[data-onboarding-welcome-cta='true']").click();
    await page.locator("[data-onboarding-email-input='true']").fill("jane.doe@baruchmail.cuny.edu");
    await page.locator("[data-onboarding-email-input='true']").press("Enter");
    await expect(
      page.locator("[data-onboarding-screen='EMAIL_ENTRY']")
    ).toBeVisible();
  });

  test("Enter on password field advances to screen 4", async ({ page, context, extensionId }) => {
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(CREDENTIAL_FIXTURE_URL)}`
    );
    await walkToPasswordEntry(page);
    const tabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-password-input='true']").press("Enter");
    const cunyTab = await tabPromise;
    await expect(
      page.locator("[data-onboarding-screen='OPENING_CUNY']")
    ).toBeVisible();
    await cunyTab.close();
  });
});

// Opening CUNY + wrong credentials + allow gate — fixture server stands in for live SSO.
// The `cuny=<url>` hash on the sidebar swaps the entry URL; `manifest.e2e.json`
// allows `http://127.0.0.1:4173/*` so the content script runs in the fixture tab.
//
// Invariants asserted here:
//   - OPENING_CUNY mounts and a new tab opens at the fixture URL.
//   - Wrong credentials: banner on the CUNY tab and sidebar on PASSWORD_ENTRY with
//     no automatic retry (single submit).
//   - Allow gate: successful submit reaches ALLOW_GATE after the fixture hits TOTP.


test.describe("onboarding screen 4 — opening CUNY", () => {
  test("advancing to screen 4 opens the CUNY fixture tab and shows the waiting copy", async ({
    page,
    context,
    extensionId,
  }) => {
    // Use the non-advancing fixture so we can assert on OPENING_CUNY + the
    // fixture URL before anything navigates away.
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(
        CREDENTIAL_FIXTURE_URL
      )}`
    );
    await walkToPasswordEntry(page);

    const tabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-password-forward='true']").click();
    const cunyTab = await tabPromise;
    await cunyTab.waitForLoadState("domcontentloaded");

    await expect(
      page.locator("[data-onboarding-screen='OPENING_CUNY']")
    ).toBeVisible();
    await expect(
      page.locator("[data-onboarding-opening-waiting='true']")
    ).toContainText("Nothing to do yet");
    await expect(
      page.locator("[data-onboarding-opening-back='true']")
    ).toBeVisible();

    expect(cunyTab.url()).toContain("/oam/server/obrareq.cgi");

    await cunyTab.close();
  });

  test("transient /auth_cred_submit without the error DOM does NOT show the banner", async ({
    context,
    extensionId,
    page,
  }) => {
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(
        CREDENTIAL_FIXTURE_ADVANCE_URL
      )}`
    );
    await walkToPasswordEntry(page);

    const tabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-password-forward='true']").click();
    const cunyTab = await tabPromise;

    // Navigate the CUNY tab directly to the success variant of /auth_cred_submit.
    // This simulates Oracle's post-POST transient page on a valid login.
    await cunyTab.goto(
      `${FIXTURE_ORIGIN}/oam/server/auth_cred_submit?outcome=success`
    );

    // Banner must not appear; give the content script time to observe the DOM.
    await cunyTab.waitForTimeout(1500);
    await expect(cunyTab.locator(`#${CREDENTIAL_ERROR_BANNER_ID}`)).toHaveCount(0);

    // Sidebar must not show the inline credential-error banner.
    await expect(
      page.locator("[data-onboarding-password-credential-error='true']")
    ).toHaveCount(0);

    await cunyTab.close();
  });
});

test.describe("CUNY_TOTP state", () => {
  test("screen 4 → CUNY_TOTP once the fixture advances to /oaa-totp-factor/", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await walkToCunyTotp(page, context, extensionId);
    await expect(cunyTab).toHaveURL(/\/oaa-totp-factor\//);
    await cunyTab.close();
  });

  test("CUNY_TOTP screen shows the type-code body copy", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await walkToCunyTotp(page, context, extensionId);
    await expect(
      page.locator("[data-onboarding-screen='CUNY_TOTP'] .onboarding-body")
    ).toContainText("Type your six-digit code");
    await expect(
      page.locator("[data-onboarding-screen='CUNY_TOTP'] .onboarding-body")
    ).not.toContainText("click Allow");
    await cunyTab.close();
  });

  test("CUNY_TOTP Back button returns to PASSWORD_ENTRY", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await walkToCunyTotp(page, context, extensionId);
    await page.locator("[data-onboarding-cuny-totp-back='true']").click();
    await expect(
      page.locator("[data-onboarding-screen='PASSWORD_ENTRY']")
    ).toBeVisible({ timeout: 5_000 });
    await cunyTab.close();
  });
});

// eslint-disable-next-line max-lines-per-function
test.describe("onboarding — wrong credentials", () => {
  test("inline #serverError render: sidebar routes to PASSWORD_ENTRY with the inline banner; no auto-retry", async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(
        CREDENTIAL_FIXTURE_WRONG_INLINE_URL
      )}`
    );
    await walkToPasswordEntry(page);

    const tabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-password-forward='true']").click();
    const cunyTab = await tabPromise;
    await cunyTab.waitForLoadState("domcontentloaded");

    await expect(
      page.locator("[data-onboarding-screen='PASSWORD_ENTRY']")
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("[data-onboarding-password-credential-error='true']")
    ).toBeVisible();
    await expect(
      page.locator("[data-onboarding-password-credential-error='true']")
    ).toContainText("didn't work");

    await expect(
      page.locator("[data-onboarding-password-input='true']")
    ).toHaveValue(E2E_PASSWORD);

    await expect(cunyTab.locator(`#${CREDENTIAL_ERROR_BANNER_ID}`)).toBeVisible();
    await expect(cunyTab.locator(`#${CREDENTIAL_ERROR_BANNER_ID}`)).toContainText(
      "CUNYAutoLogin"
    );

    // Hard block on auto-retry: the content-script's single-shot guard means
    // exactly one submit happened even though the fixture stayed on the same
    // URL with the #serverError alert present.
    const submitCount = await cunyTab.evaluate(
      () =>
        (window as unknown as { __e2eCredentialSubmitCount: number })
          .__e2eCredentialSubmitCount
    );
    expect(submitCount).toBe(1);

    await cunyTab.close();
  });

  test("redirect to /auth_cred_submit: sidebar routes back to PASSWORD_ENTRY with banner", async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(
        CREDENTIAL_FIXTURE_WRONG_REDIRECT_URL
      )}`
    );
    await walkToPasswordEntry(page);

    const tabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-password-forward='true']").click();
    const cunyTab = await tabPromise;
    await cunyTab.waitForLoadState("domcontentloaded");

    await expect(cunyTab).toHaveURL(/\/oam\/server\/auth_cred_submit/, {
      timeout: 15_000,
    });

    await expect(
      page.locator("[data-onboarding-screen='PASSWORD_ENTRY']")
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("[data-onboarding-password-credential-error='true']")
    ).toBeVisible();

    // Banner on the CUNY tab proves the extension is the author of the
    // error surface — not CUNY's own alert.
    await expect(cunyTab.locator(`#${CREDENTIAL_ERROR_BANNER_ID}`)).toBeVisible();

    await cunyTab.close();
  });

  test("typing in the password field after a credential error clears the inline banner", async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(
      `chrome-extension://${extensionId}/sidebar.html${onboardingHashWith(
        CREDENTIAL_FIXTURE_WRONG_INLINE_URL
      )}`
    );
    await walkToPasswordEntry(page);
    const tabPromise = context.waitForEvent("page");
    await page.locator("[data-onboarding-password-forward='true']").click();
    const cunyTab = await tabPromise;
    await cunyTab.waitForLoadState("domcontentloaded");

    const banner = page.locator(
      "[data-onboarding-password-credential-error='true']"
    );
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // Per spec, once the student edits the password the red banner hides.
    await page
      .locator("[data-onboarding-password-input='true']")
      .fill(`${E2E_PASSWORD}-edit`);
    await expect(banner).toBeHidden();

    await cunyTab.close();
  });

  test("direct visit to /auth_cred_submit shows the extension banner without refill", async ({
    context,
  }) => {
    // No sidebar interaction — simulates a user hitting the rejection URL
    // directly (e.g. after restoring a tab). The content script must still
    // mount the banner and NOT attempt a fill.
    const cunyTab = await context.newPage();
    await cunyTab.goto(CREDENTIAL_ERROR_FIXTURE_URL);
    await expect(cunyTab.locator(`#${CREDENTIAL_ERROR_BANNER_ID}`)).toBeVisible({
      timeout: 10_000,
    });
    await cunyTab.close();
  });
});

test.describe("not set up (onboarding)", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    // Fresh context has no vault → sidebar loads onboarding naturally.
    await page.goto(`chrome-extension://${extensionId}/sidebar.html`);
    await expect(page.locator("[data-onboarding-screen='WELCOME']")).toBeVisible({ timeout: 15_000 });
  });

  test("fills delayed self-service OTP field after setup", async ({ page, extensionId, context }) => {
    await setupVault(page, extensionId);

    const fixturePage = await context.newPage();
    await fixturePage.goto(SELF_SERVICE_FIXTURE_URL);

    const otpInput = fixturePage.locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`);
    await expect(otpInput).toHaveValue(/^\d{6}$/, { timeout: 15_000 });
    const typedValue = await otpInput.inputValue();

    // Accept any of the adjacent 30 s windows — generate-time and fill-time can
    // straddle a TOTP boundary, which would otherwise flake.
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
});
