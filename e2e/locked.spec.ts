import {
  CREDENTIAL_INPUT_IDS,
  RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID,
  TOTP_OTP_INPUT_ID,
} from "../src/cuny/ssoSite";
import {
  CREDENTIAL_FIXTURE_URL,
  SELF_SERVICE_FIXTURE_URL,
  TOTP_FIXTURE_URL,
} from "./constants";
import { expect, test } from "./extension-fixture";
import {
  expectInputRemainsEmpty,
  lockVault,
  setupVault,
} from "./helpers";

test.describe("vault locked", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await setupVault(page, extensionId);
    await lockVault(page);
  });

  test("does not autofill username or password on credential page", async ({ context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(CREDENTIAL_FIXTURE_URL);

    await expectInputRemainsEmpty(fixturePage.locator(`#${CREDENTIAL_INPUT_IDS.username}`), fixturePage);
    await expectInputRemainsEmpty(fixturePage.locator(`#${CREDENTIAL_INPUT_IDS.password}`), fixturePage);
  });

  test("does not autofill OTP on TOTP page", async ({ context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(TOTP_FIXTURE_URL);

    await expectInputRemainsEmpty(fixturePage.locator(`[id="${TOTP_OTP_INPUT_ID}"]`), fixturePage);
  });

  test("does not autofill delayed verify OTP on self-service page", async ({ context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(SELF_SERVICE_FIXTURE_URL);

    const otpInput = fixturePage.locator(`[id="${RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID}"]`);
    await expect(otpInput).toBeVisible({ timeout: 15_000 });
    await expectInputRemainsEmpty(otpInput, fixturePage);
  });
});
