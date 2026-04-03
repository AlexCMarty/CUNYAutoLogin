import type { Page } from "@playwright/test";
import { TOTP } from "totp-generator";
import { TOTP_GENERATION_OPTIONS } from "../src/cuny/ssoSite";
import { CREDENTIAL_FIXTURE_URL, TOTP_FIXTURE_URL } from "./constants";
import { expect, test } from "./extension-fixture";
import {
  E2E_EMAIL,
  E2E_MASTER_PASSWORD,
  E2E_PASSWORD,
  E2E_TOTP_SECRET,
} from "./test-credentials";

async function gotoPopup(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
}

async function clearVaultIfPossible(page: Page) {
  const clearBtn = page.locator("#clear-vault-debug-btn");
  if (await clearBtn.isVisible()) {
    page.once("dialog", (d) => {
      d.accept();
    });
    await clearBtn.click();
    await expect(page.locator("#mode-hint")).toContainText("First-time setup");
  }
}

async function setupVault(page: Page) {
  await page.locator("#email").fill(E2E_EMAIL);
  await page.locator("#password").fill(E2E_PASSWORD);
  await page.locator("#totpSecret").fill(E2E_TOTP_SECRET);
  await page.locator("#masterPassword").fill(E2E_MASTER_PASSWORD);
  await page.locator("#vault-form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator("#status")).toContainText("Saved", { timeout: 15_000 });
}

test.describe("extension autofill against local fixtures", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await gotoPopup(page, extensionId);
    await clearVaultIfPossible(page);
  });

  test("fills credential page via AUTO_FILL_REQUEST on load", async ({ page, context }) => {
    await setupVault(page);

    const fixturePage = await context.newPage();
    await fixturePage.goto(CREDENTIAL_FIXTURE_URL);

    await expect(fixturePage.locator("#CUNYLoginUsernameDisplay")).toHaveValue(E2E_EMAIL, {
      timeout: 15_000,
    });
    await expect(fixturePage.locator("#CUNYLoginPassword")).toHaveValue(E2E_PASSWORD);
    expect(
      await fixturePage.evaluate(
        () => (window as unknown as { __e2eCredentialSubmitted?: boolean }).__e2eCredentialSubmitted
      )
    ).toBe(true);
  });

  test("fills TOTP via AUTO_FILL_REQUEST on load", async ({ page, context }) => {
    await setupVault(page);

    const fixturePage = await context.newPage();
    await fixturePage.goto(TOTP_FIXTURE_URL);

    const { otp } = await TOTP.generate(E2E_TOTP_SECRET, TOTP_GENERATION_OPTIONS);
    await expect(fixturePage.locator('[id="otpValue|input"]')).toHaveValue(otp, { timeout: 15_000 });
  });

  test("does not fill credential page when vault is locked", async ({ page, context }) => {
    await setupVault(page);
    await page.locator("#lock-btn").click();

    const fixturePage = await context.newPage();
    await fixturePage.goto(CREDENTIAL_FIXTURE_URL);
    // autoFill runs asynchronously; wait long enough that a successful fill would have completed
    await fixturePage.waitForTimeout(5000);
    await expect(fixturePage.locator("#CUNYLoginUsernameDisplay")).toHaveValue("");
  });
});
