import { TOTP } from "totp-generator";
import {
  CREDENTIAL_INPUT_IDS,
  TOTP_GENERATION_OPTIONS,
  TOTP_OTP_INPUT_ID,
} from "../src/cuny/ssoSite";
import {
  TOTP_ERROR_BANNER_ID,
  TOTP_ERROR_BANNER_COPY,
} from "../src/content/banner";
import {
  CREDENTIAL_FIXTURE_URL,
  CREDENTIAL_SAMLV20_FIXTURE_URL,
  TOTP_FIXTURE_URL,
  TOTP_FIXTURE_WRONG_CODE_URL,
} from "./constants";
import { expect, test } from "./extension-fixture";
import { setupVault } from "./helpers";
import { E2E_EMAIL, E2E_PASSWORD, E2E_TOTP_SECRET } from "./test-credentials";

test.describe("vault unlocked", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await setupVault(page, extensionId);
  });

  test("autofills credential page and clicks Log In", async ({ context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(CREDENTIAL_FIXTURE_URL);

    await expect(fixturePage.locator(`#${CREDENTIAL_INPUT_IDS.username}`)).toHaveValue(E2E_EMAIL, {
      timeout: 15_000,
    });
    await expect(fixturePage.locator(`#${CREDENTIAL_INPUT_IDS.password}`)).toHaveValue(E2E_PASSWORD);
    expect(
      await fixturePage.evaluate(
        () => (window as unknown as { __e2eCredentialSubmitted?: boolean }).__e2eCredentialSubmitted
      )
    ).toBe(true);
  });

  test("autofills TOTP page and clicks Verify", async ({ context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(TOTP_FIXTURE_URL);

    const { otp } = await TOTP.generate(E2E_TOTP_SECRET, TOTP_GENERATION_OPTIONS);
    await expect(fixturePage.locator(`[id="${TOTP_OTP_INPUT_ID}"]`)).toHaveValue(otp, {
      timeout: 15_000,
    });
    expect(
      await fixturePage.evaluate(
        () => (window as unknown as { __e2eTotpVerified?: boolean }).__e2eTotpVerified
      )
    ).toBe(true);
  });

  test("shows TOTP error banner and does not auto-fill when emsg param is present", async ({ context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(TOTP_FIXTURE_WRONG_CODE_URL);

    const banner = fixturePage.locator(`#${TOTP_ERROR_BANNER_ID}`);
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText(TOTP_ERROR_BANNER_COPY);
    await expect(fixturePage.locator(`[id="${TOTP_OTP_INPUT_ID}"]`)).toHaveValue("");
    expect(
      await fixturePage.evaluate(
        () => (window as unknown as { __e2eTotpVerified?: boolean }).__e2eTotpVerified
      )
    ).toBe(false);
  });

  test("Try again button on TOTP error banner fills code and clicks Verify", async ({ context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(TOTP_FIXTURE_WRONG_CODE_URL);

    await expect(fixturePage.locator(`#${TOTP_ERROR_BANNER_ID}`)).toBeVisible({ timeout: 15_000 });
    await fixturePage.locator(`#${TOTP_ERROR_BANNER_ID} button`).click();

    const { otp } = await TOTP.generate(E2E_TOTP_SECRET, TOTP_GENERATION_OPTIONS);
    await expect(fixturePage.locator(`[id="${TOTP_OTP_INPUT_ID}"]`)).toHaveValue(otp, {
      timeout: 5_000,
    });
    expect(
      await fixturePage.evaluate(
        () => (window as unknown as { __e2eTotpVerified?: boolean }).__e2eTotpVerified
      )
    ).toBe(true);
  });

  test("autofills on alternate credential URL marker", async ({ context }) => {
    const fixturePage = await context.newPage();
    await fixturePage.goto(CREDENTIAL_SAMLV20_FIXTURE_URL);

    await expect(fixturePage.locator(`#${CREDENTIAL_INPUT_IDS.username}`)).toHaveValue(E2E_EMAIL, {
      timeout: 15_000,
    });
    await expect(fixturePage.locator(`#${CREDENTIAL_INPUT_IDS.password}`)).toHaveValue(E2E_PASSWORD);
  });
});
