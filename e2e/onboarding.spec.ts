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
import { clearVaultIfPossible, gotoPopup, setupVault } from "./helpers";
import { E2E_TOTP_SECRET } from "./test-credentials";

const FIXTURE_SECRET = "UU7UV2G7UCS5LETS";

test.describe("not set up (onboarding)", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await gotoPopup(page, extensionId);
    await clearVaultIfPossible(page);
  });

  test("pulls delayed TOTP secret from self-service page into popup", async ({ page, context }) => {
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
