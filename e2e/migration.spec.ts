import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import setupWasm from "argon2id/lib/setup.js";
import { expect, test } from "./extension-fixture";
import { lockVault, setupVault } from "./helpers";
import {
  E2E_EMAIL,
  E2E_MASTER_PASSWORD,
  E2E_PASSWORD,
  E2E_TOTP_SECRET,
} from "./test-credentials";

// Storage key literal — source of truth: src/crypto/vault.ts (VAULT_STORAGE_KEY).
const VAULT_STORAGE_KEY = "cunyVault";
// Argon2id OWASP minimum — source of truth: src/crypto/vault.ts.
const ARGON2ID_MEMORY_KIB = 19 * 1024;
const ARGON2ID_PASSES = 2;
const ARGON2ID_PARALLELISM = 1;
const ARGON2ID_TAG_LENGTH = 32;
const PBKDF2_ITERATIONS_V2 = 600_000;

type StoredVaultRaw = {
  readonly version: number;
  readonly iterations?: number;
  readonly memorySize?: number;
  readonly passes?: number;
  readonly parallelism?: number;
  readonly saltB64: string;
  readonly ivB64: string;
  readonly ciphertextB64: string;
};

const require = createRequire(import.meta.url);
const argon2idPromise = setupWasm(
  (imports) =>
    WebAssembly.instantiate(readFileSync(require.resolve("argon2id/dist/simd.wasm")), imports),
  (imports) =>
    WebAssembly.instantiate(readFileSync(require.resolve("argon2id/dist/no-simd.wasm")), imports)
);

/** Seed a locked v2/600k vault (the shape shipped in v0.10.x) without migrating. */
async function setupLegacyV2Vault(page: Page, extensionId: string): Promise<void> {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(
    Buffer.from(E2E_MASTER_PASSWORD, "utf8"),
    salt,
    PBKDF2_ITERATIONS_V2,
    32,
    "sha256"
  );
  const plaintext = Buffer.from(
    JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD, totpSecret: E2E_TOTP_SECRET }),
    "utf8"
  );
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const ciphertext = Buffer.concat([enc, cipher.getAuthTag()]);
  const vault = {
    version: 2 as const,
    iterations: PBKDF2_ITERATIONS_V2,
    saltB64: salt.toString("base64"),
    ivB64: iv.toString("base64"),
    ciphertextB64: ciphertext.toString("base64"),
  };

  await page.goto(`chrome-extension://${extensionId}/sidebar.html`);
  await page.evaluate(
    async ({ vaultBlob, vaultKey }) => {
      await chrome.storage.local.set({ [vaultKey]: vaultBlob });
      await chrome.storage.session.clear();
    },
    { vaultBlob: vault, vaultKey: VAULT_STORAGE_KEY }
  );
  await page.reload();
  await expect(page.locator("#masterPassword")).toBeVisible({ timeout: 15_000 });
}

async function readStoredVault(page: Page): Promise<StoredVaultRaw> {
  return page.evaluate(
    (key) =>
      new Promise<StoredVaultRaw>((resolve) => {
        chrome.storage.local.get(key, (items) => resolve(items[key] as StoredVaultRaw));
      }),
    VAULT_STORAGE_KEY
  );
}

/**
 * Decrypts a v3 Argon2id vault blob in Node to prove the migrated ciphertext
 * still opens with the SAME master password. Mirrors the Web Crypto AES-256-GCM
 * layout encryptVault writes (16-byte auth tag appended to the ciphertext).
 */
async function decryptStoredVaultV3(vault: StoredVaultRaw, master: string): Promise<unknown> {
  const { memorySize, passes, parallelism } = vault;
  if (
    typeof memorySize !== "number" ||
    typeof passes !== "number" ||
    typeof parallelism !== "number"
  ) {
    throw new Error("v3 vault is missing self-describing Argon2id cost fields");
  }
  const argon2id = await argon2idPromise;
  const key = Buffer.from(
    argon2id({
      password: new TextEncoder().encode(master),
      salt: Buffer.from(vault.saltB64, "base64"),
      parallelism,
      passes,
      memorySize,
      tagLength: ARGON2ID_TAG_LENGTH,
    })
  );
  const data = Buffer.from(vault.ciphertextB64, "base64");
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(vault.ivB64, "base64"));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

async function assertMigratesToV3(page: Page, before: StoredVaultRaw): Promise<void> {
  await page.locator("#masterPassword").fill(E2E_MASTER_PASSWORD);
  await page.locator("#submit-btn").click();
  await expect(page.locator("#mode-hint")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await readStoredVault(page)).version, { timeout: 15_000 })
    .toBe(3);

  const after = await readStoredVault(page);
  expect(after.memorySize).toBe(ARGON2ID_MEMORY_KIB);
  expect(after.passes).toBe(ARGON2ID_PASSES);
  expect(after.parallelism).toBe(ARGON2ID_PARALLELISM);
  expect(after.saltB64).not.toBe(before.saltB64);
  expect(after.ivB64).not.toBe(before.ivB64);
  expect(await decryptStoredVaultV3(after, E2E_MASTER_PASSWORD)).toEqual({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
    totpSecret: E2E_TOTP_SECRET,
  });
}

test.describe("vault migration (v1 → v3)", () => {
  test("a real password unlock migrates a legacy v1 vault to v3/Argon2id and it still decrypts to the original credentials", async ({
    page,
    extensionId,
  }) => {
    await setupVault(page, extensionId);

    // Precondition: setupVault provisions a v1/310k blob and lands unlocked via
    // the snapshot-restore path, which intentionally does NOT migrate — so the
    // on-disk vault is still legacy v1 at this point.
    const before = await readStoredVault(page);
    expect(before.version).toBe(1);
    expect(before.iterations).toBeUndefined();

    await lockVault(page);
    await assertMigratesToV3(page, before);
  });
});

test.describe("vault migration (v2 → v3)", () => {
  test("a real password unlock migrates a legacy v2/600k vault to v3/Argon2id and it still decrypts to the original credentials", async ({
    page,
    extensionId,
  }) => {
    await setupLegacyV2Vault(page, extensionId);

    const before = await readStoredVault(page);
    expect(before.version).toBe(2);
    expect(before.iterations).toBe(PBKDF2_ITERATIONS_V2);

    await assertMigratesToV3(page, before);
  });
});
