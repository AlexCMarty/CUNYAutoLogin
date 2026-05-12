import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect } from "./extension-fixture";
import { CREDENTIAL_FIXTURE_ADVANCE_URL } from "./constants";
import {
  E2E_EMAIL,
  E2E_MASTER_PASSWORD,
  E2E_PASSWORD,
  E2E_TOTP_SECRET,
} from "./test-credentials";

// Storage key literals — source of truth: src/crypto/vault.ts (VAULT_STORAGE_KEY),
// src/cuny/ssoSite.ts (SESSION_MASTER_KEY, PBKDF2_ITERATIONS).
const VAULT_STORAGE_KEY = "cunyVault";
const SESSION_MASTER_KEY = "cunySessionMaster";
const PBKDF2_ITERATIONS = 310_000;

/**
 * Provisions a vault programmatically using `window.crypto.subtle` (same algorithm
 * as src/crypto/vault.ts: PBKDF2-SHA256 / AES-GCM-256).  Navigates to sidebar.html,
 * injects vault + session master into extension storage, then reloads so the
 * vault controller sees an unlocked vault.
 */
export async function setupVault(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/sidebar.html`);
  await page.evaluate(
    async ({ email, password, totpSecret, master, vaultKey, sessionKey, iterations }) => {
      const enc = new TextEncoder();

      function bytesToBase64(bytes: Uint8Array): string {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        return btoa(binary);
      }

      const salt = crypto.getRandomValues(new Uint8Array(32));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = enc.encode(JSON.stringify({ email, password, totpSecret }));

      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(master),
        "PBKDF2",
        false,
        ["deriveKey"]
      );
      const aesKey = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
      );
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext);

      const vault = {
        version: 1,
        saltB64: bytesToBase64(salt),
        ivB64: bytesToBase64(iv),
        ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
      };

      await chrome.storage.local.set({ [vaultKey]: vault });
      await chrome.storage.session.set({ [sessionKey]: master });
    },
    {
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      totpSecret: E2E_TOTP_SECRET,
      master: E2E_MASTER_PASSWORD,
      vaultKey: VAULT_STORAGE_KEY,
      sessionKey: SESSION_MASTER_KEY,
      iterations: PBKDF2_ITERATIONS,
    }
  );
  await page.reload();
  // After reload the vault controller hydrates from snapshot → unlocked state.
  await expect(page.locator("#vault-status-bar")).toBeVisible({ timeout: 15_000 });
}

export async function clearVaultIfPossible(page: Page): Promise<void> {
  const clearBtn = page.locator("#clear-vault-debug-btn");
  if (await clearBtn.isVisible()) {
    page.once("dialog", (dialog) => {
      dialog.accept();
    });
    await clearBtn.click();
    // After reset the sidebar reloads into onboarding (no vault → WELCOME screen).
    await expect(page.locator("[data-onboarding-screen='WELCOME']")).toBeVisible({
      timeout: 15_000,
    });
  }
}

export async function lockVault(page: Page): Promise<void> {
  await page.locator("#lock-btn").click();
  await expect(page.locator("#vault-locked-header")).toBeVisible();
  await expect(page.locator("#submit-btn")).toHaveText("Unlock");
  await expect(page.locator("#vault-greeting-sub")).toContainText(
    "Use your biometrics or type your password to fill your CUNY sign-in."
  );
}

export async function waitForAutofillWindow(page: Page, waitMs = 5000): Promise<void> {
  // AUTO_FILL_REQUEST and delayed DOM insertion are async; wait a full window for negatives.
  await page.waitForTimeout(waitMs);
}

export async function expectInputRemainsEmpty(
  input: Locator,
  page: Page,
  waitMs = 5000
): Promise<void> {
  await waitForAutofillWindow(page, waitMs);
  await expect(input).toHaveValue("");
}

/**
 * Builds the sidebar URL hash that enables the onboarding dev escape hatch and
 * points the flow at a custom CUNY fixture URL instead of the live CUNY SSO site.
 */
export const onboardingHashWith = (cunyUrl: string): string =>
  `#onboarding=1&cuny=${encodeURIComponent(cunyUrl)}`;

/**
 * Navigates the onboarding sidebar from WELCOME through EMAIL_ENTRY to
 * PASSWORD_ENTRY, filling in test credentials. Does NOT click the forward
 * button on the password screen — the caller decides when to proceed.
 */
export async function walkToPasswordEntry(page: Page): Promise<void> {
  await page.locator("[data-onboarding-welcome-cta='true']").click();
  await page.locator("[data-onboarding-email-input='true']").fill(E2E_EMAIL);
  await page.locator("[data-onboarding-email-forward='true']").click();
  await page.locator("[data-onboarding-password-input='true']").fill(E2E_PASSWORD);
}

/**
 * Walks the onboarding flow to CUNY_TOTP state using the credential-advance
 * fixture. Returns the CUNY tab (at /oaa-totp-factor/); caller must close it.
 */
export async function walkToCunyTotp(
  page: Page,
  context: BrowserContext,
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
  return cunyTab;
}
