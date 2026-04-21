import { TOTP } from "totp-generator";
import {
  RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID,
  TOTP_GENERATION_OPTIONS,
} from "../src/cuny/ssoSite";
import {
  SELF_SERVICE_FIXTURE_URL,
  SELF_SERVICE_INVALID_SECRET_FIXTURE_URL,
} from "./constants";
import { expect, test } from "./extension-fixture";
import { clearVaultIfPossible, gotoPrimarySurface, setupVault } from "./helpers";
import { E2E_TOTP_SECRET } from "./test-credentials";

const FIXTURE_SECRET = "UU7UV2G7UCS5LETS";

const ONBOARDING_HASH = "#onboarding=1";

// Plan-04 exercises the onboarding v2 shell through a dev-only URL-hash
// escape hatch so the `ONBOARDING_V2_ENABLED` compile-time flag stays `false`
// in production. `build:e2e` uses `--mode development`, which makes
// `import.meta.env.DEV === true` inside `src/sidebar/sidebar.ts`, so the hash
// check is live for these specs.
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
