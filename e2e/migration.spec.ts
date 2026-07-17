import { createDecipheriv } from "node:crypto";
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

    // A real password unlock (handleLocked) is the path that re-encrypts forward.
    await lockVault(page);
    await page.locator("#masterPassword").fill(E2E_MASTER_PASSWORD);
    await page.locator("#submit-btn").click();
    // Migration is awaited before the unlocked UI renders, so once the unlocked
    // mode hint is visible the v3 blob has already been persisted.
    await expect(page.locator("#mode-hint")).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => (await readStoredVault(page)).version, { timeout: 15_000 })
      .toBe(3);

    const after = await readStoredVault(page);
    expect(after.memorySize).toBe(ARGON2ID_MEMORY_KIB);
    expect(after.passes).toBe(ARGON2ID_PASSES);
    expect(after.parallelism).toBe(ARGON2ID_PARALLELISM);
    // Fresh salt AND IV on re-encrypt — no reuse of the v1 material (no AES-GCM
    // nonce reuse).
    expect(after.saltB64).not.toBe(before.saltB64);
    expect(after.ivB64).not.toBe(before.ivB64);

    // The migrated v3 ciphertext still opens with the SAME master password and
    // yields the EXACT original credentials — proves no data loss / no lockout.
    expect(await decryptStoredVaultV3(after, E2E_MASTER_PASSWORD)).toEqual({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      totpSecret: E2E_TOTP_SECRET,
    });
  });
});
