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
  SELF_SERVICE_INVALID_SECRET_FIXTURE_URL,
} from "./constants";
import { expect, test } from "./extension-fixture";
import { clearVaultIfPossible, gotoPrimarySurface, onboardingHashWith, setupVault, walkToCunyTotp, walkToPasswordEntry } from "./helpers";
import { E2E_PASSWORD, E2E_TOTP_SECRET } from "./test-credentials";
import { CREDENTIAL_ERROR_BANNER_ID } from "../src/content/banner";

const FIXTURE_SECRET = "UU7UV2G7UCS5LETS";

const ONBOARDING_HASH = "#onboarding=1";

// Plan-04 exercises the onboarding shell through the dev-only `#onboarding=1`
// URL hash (see `src/sidebar/sidebar.ts`). `build:e2e` uses `--mode development`
// so that hash branch is live for these specs.
// eslint-disable-next-line max-lines-per-function
test.describe("onboarding screens 1-3", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidebar.html${ONBOARDING_HASH}`);
  });

  test("mounts bead header + welcome screen when #onboarding=1 is present", async ({ page }) => {
    await expect(page.locator("#onboarding-root")).toBeVisible();
    await expect(page.locator("main.wrap")).toBeHidden();

    const beads = page.locator("[data-onboarding-bead='true']");
    await expect(beads).toHaveCount(5);
    await expect(beads.nth(0)).toContainText("Your info");
    await expect(beads.nth(0)).toHaveAttribute("data-bead-status", "active");

    await expect(
      page.locator("[data-onboarding-screen='WELCOME']")
    ).toBeVisible();
    await expect(
      page.locator("[data-onboarding-welcome-cta='true']")
    ).toHaveText("Let's go");
    await expect(
      page.locator("[data-onboarding-welcome-reassurance='true']")
    ).toContainText("saved only on this device, encrypted");
  });

  test("forward path Welcome → Email → Password; bead 1 stays active", async ({ page }) => {
    await page.locator("[data-onboarding-welcome-cta='true']").click();
    await expect(
      page.locator("[data-onboarding-screen='EMAIL_ENTRY']")
    ).toBeVisible();

    const emailInput = page.locator("[data-onboarding-email-input='true']");
    const emailForward = page.locator("[data-onboarding-email-forward='true']");
    await emailInput.fill("jane.doe@login.cuny.edu");
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

    await emailInput.fill("jane.doe@baruchmail.cuny.edu");
    await expect(emailForward).toBeDisabled();
    await emailInput.blur();
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("CUNY logins end in @login.cuny.edu");

    await emailInput.fill("jane.doe@login.cuny.edu");
    await expect(hint).toBeHidden();
    await expect(emailForward).toBeEnabled();
  });

  test("password screen: show/hide toggle and non-empty gating", async ({ page }) => {
    await page.locator("[data-onboarding-welcome-cta='true']").click();
    await page
      .locator("[data-onboarding-email-input='true']")
      .fill("jane.doe@login.cuny.edu");
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
});

// ─── Plan-05: Screen 4, wrong credentials, allow gate ────────────────────────
//
// These specs exercise the Opening-CUNY flow end-to-end against the fixture
// server instead of live CUNY SSO. The dev-hash `cuny=<url>` param on the
// sidebar swaps the entry URL for the fixture. The content script loads into
// the fixture tab because `src/manifest.e2e.json` matches
// `http://127.0.0.1:4173/*`.
//
// Validation gate:
//   - screen 4: sidebar mounts OPENING_CUNY, a new tab opens at the fixture.
//   - wrong credentials: content script detects the failure, inserts the
//     extension banner, and the sidebar routes to E2E_PASSWORD_ENTRY without any
//     automatic retry (single submit only).
//   - allow gate: successful credential submission advances the sidebar to
//     ALLOW_GATE once the fixture redirects to /oaa-totp-factor/.


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

    // Sidebar is on Screen 4 with the spec-mandated copy.
    await expect(
      page.locator("[data-onboarding-screen='OPENING_CUNY']")
    ).toBeVisible();
    await expect(
      page.locator("[data-onboarding-opening-waiting='true']")
    ).toContainText("Nothing to do yet");
    await expect(
      page.locator("[data-onboarding-opening-back='true']")
    ).toBeVisible();

    // The CUNY-tab URL is our fixture.
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

    // Sidebar must not have routed backward to E2E_PASSWORD_ENTRY with an error.
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

  test("CUNY_TOTP screen shows the enter-code body copy", async ({
    page,
    context,
    extensionId,
  }) => {
    const cunyTab = await walkToCunyTotp(page, context, extensionId);
    await expect(
      page.locator("[data-onboarding-screen='CUNY_TOTP'] .onboarding-body")
    ).toContainText("Enter your six-digit code");
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
  test("inline #serverError render: sidebar routes to E2E_PASSWORD_ENTRY with the inline banner; no auto-retry", async ({
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

    // Sidebar lands on E2E_PASSWORD_ENTRY with the inline credential-error banner.
    await expect(
      page.locator("[data-onboarding-screen='PASSWORD_ENTRY']")
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("[data-onboarding-password-credential-error='true']")
    ).toBeVisible();
    await expect(
      page.locator("[data-onboarding-password-credential-error='true']")
    ).toContainText("didn't work");

    // Pre-filled credentials survive the round-trip.
    await expect(
      page.locator("[data-onboarding-password-input='true']")
    ).toHaveValue(E2E_PASSWORD);

    // Extension-branded banner is mounted in the CUNY tab.
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

  test("redirect to /auth_cred_submit: sidebar routes back to E2E_PASSWORD_ENTRY with banner", async ({
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

    // Fixture redirects to /auth_cred_submit.
    await expect(cunyTab).toHaveURL(/\/oam\/server\/auth_cred_submit/, {
      timeout: 15_000,
    });

    // Sidebar routes back to E2E_PASSWORD_ENTRY with the banner visible.
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
    await gotoPrimarySurface(page, extensionId);
    await clearVaultIfPossible(page);
  });

  test("pulls delayed TOTP secret from self-service page into side panel", async ({ page, context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(SELF_SERVICE_FIXTURE_URL);

    await expect(page.locator("#totpSecret")).toHaveValue(FIXTURE_SECRET, { timeout: 15_000 });
  });

  test("fills delayed self-service OTP field after setup", async ({ page, context }) => {
    await setupVault(page);

    const fixturePage = await context.newPage();
    await fixturePage.goto(SELF_SERVICE_FIXTURE_URL);

    const { otp } = await TOTP.generate(E2E_TOTP_SECRET, TOTP_GENERATION_OPTIONS);
    await expect(fixturePage.locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`)).toHaveValue(otp, {
      timeout: 15_000,
    });
  });

  test("ignores invalid self-service secret while onboarding", async ({ page, context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(SELF_SERVICE_INVALID_SECRET_FIXTURE_URL);

    await expect(page.locator("#totpSecret")).toHaveValue("");
    await fixturePage.waitForTimeout(3000);
    await expect(page.locator("#totpSecret")).toHaveValue("");
  });
});
