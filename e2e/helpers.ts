import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
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

type SerializedVault = {
  readonly version: 1;
  readonly saltB64: string;
  readonly ivB64: string;
  readonly ciphertextB64: string;
};

// Computed once per worker (top-level = first import in the worker process).
// PBKDF2(310k) takes ~600ms and the inputs never vary across tests, so doing
// it in Node beats running it inside every test's browser context.
const CACHED_VAULT: SerializedVault = (() => {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(
    Buffer.from(E2E_MASTER_PASSWORD, "utf8"),
    salt,
    PBKDF2_ITERATIONS,
    32,
    "sha256"
  );
  const plaintext = Buffer.from(
    JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD, totpSecret: E2E_TOTP_SECRET }),
    "utf8"
  );
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  // Web Crypto AES-GCM appends the 16-byte auth tag to the ciphertext — match that layout.
  const ciphertext = Buffer.concat([enc, cipher.getAuthTag()]);
  return {
    version: 1,
    saltB64: salt.toString("base64"),
    ivB64: iv.toString("base64"),
    ciphertextB64: ciphertext.toString("base64"),
  };
})();

/**
 * Provisions a vault programmatically. The vault payload is precomputed once
 * per worker (see CACHED_VAULT) so PBKDF2-310k never runs inside a test's
 * browser context — we just push the cached blob into extension storage.
 */
export async function setupVault(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/sidebar.html`);
  await page.evaluate(
    async ({ vault, master, vaultKey, sessionKey }) => {
      await chrome.storage.local.set({ [vaultKey]: vault });
      await chrome.storage.session.set({ [sessionKey]: master });
    },
    {
      vault: CACHED_VAULT,
      master: E2E_MASTER_PASSWORD,
      vaultKey: VAULT_STORAGE_KEY,
      sessionKey: SESSION_MASTER_KEY,
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

export async function waitForAutofillWindow(page: Page, waitMs = 1500): Promise<void> {
  // AUTO_FILL_REQUEST and delayed DOM insertion are async; wait a window for negatives.
  await page.waitForTimeout(waitMs);
}

export async function expectInputRemainsEmpty(
  input: Locator,
  page: Page,
  waitMs = 1500
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
 * Fast path to land the onboarding controller in `targetState` without walking
 * the full credential → TOTP → enroll → set-default fixture chain. Uses the
 * dev `#qa=` jump hook (see [devQaJump.ts](../src/onboarding/devQaJump.ts)) to
 * seed `initialState`, `initialEmail`, `initialPassword`, then primes the
 * pending TOTP secret in session storage so screens that read it (e.g.
 * EXT_PASSWORD_SETUP's vault-save) behave as if onboarding had progressed
 * through real enrollment. Only valid for tests that do NOT depend on a
 * real CUNY tab or accumulated content-script state.
 */
export async function setupViaQaJump(
  page: Page,
  extensionId: string,
  targetState: string
): Promise<void> {
  await page.goto(
    `chrome-extension://${extensionId}/sidebar.html#qa=${targetState}&qaEmail=${encodeURIComponent(
      E2E_EMAIL
    )}&qaPassword=${encodeURIComponent(E2E_PASSWORD)}`
  );
  // Seed the pending TOTP secret in session storage so vault save at
  // EXT_PASSWORD_SETUP encrypts a real secret (matches what the live flow
  // would have staged by the time the student lands on this screen). Key
  // literal mirrors PENDING_TOTP_SECRET_SESSION_KEY in src/cuny/ssoSite.ts.
  await page.evaluate(async (secret: string) => {
    await chrome.storage.session.set({ cunyPendingTotpSecretFromSso: secret });
  }, E2E_TOTP_SECRET);
  await expect(page.locator(`[data-onboarding-screen='${targetState}']`)).toBeVisible({
    timeout: 10_000,
  });
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
