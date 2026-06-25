import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import type { Page } from "@playwright/test";
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
// The v2 work factor — source of truth: src/crypto/vault.ts (PBKDF2_ITERATIONS).
// Hardcoded (not imported) to keep vault.ts's browser/Web-Crypto deps out of the
// Node test process, mirroring how helpers.ts pins LEGACY_PBKDF2_ITERATIONS_V1.
const PBKDF2_ITERATIONS_V2 = 600_000;

type StoredVaultRaw = {
  readonly version: number;
  readonly iterations?: number;
  readonly saltB64: string;
  readonly ivB64: string;
  readonly ciphertextB64: string;
};

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
 * Decrypts a v2 vault blob in Node, at the iteration count the blob describes,
 * to prove the migrated ciphertext still opens with the SAME master password.
 * Mirrors the Web Crypto AES-256-GCM layout encryptVault writes (16-byte auth
 * tag appended to the ciphertext). Throws on auth failure — i.e. a GCM tag
 * mismatch surfaces as a thrown error, which is exactly the lockout we assert
 * against.
 */
function decryptStoredVault(vault: StoredVaultRaw, master: string): unknown {
  const { iterations } = vault;
  if (typeof iterations !== "number") {
    throw new Error("v2 vault is missing its self-describing iterations field");
  }
  const key = pbkdf2Sync(
    Buffer.from(master, "utf8"),
    Buffer.from(vault.saltB64, "base64"),
    iterations,
    32,
    "sha256"
  );
  const data = Buffer.from(vault.ciphertextB64, "base64");
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(vault.ivB64, "base64"));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

test.describe("vault migration (v1 → v2)", () => {
  test("a real password unlock migrates a legacy v1 vault to v2/600k and it still decrypts to the original credentials", async ({
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
    // mode hint is visible the v2 blob has already been persisted.
    await expect(page.locator("#mode-hint")).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => (await readStoredVault(page)).version, { timeout: 15_000 })
      .toBe(2);

    const after = await readStoredVault(page);
    expect(after.iterations).toBe(PBKDF2_ITERATIONS_V2);
    // Fresh salt AND IV on re-encrypt — no reuse of the v1 material (no AES-GCM
    // nonce reuse).
    expect(after.saltB64).not.toBe(before.saltB64);
    expect(after.ivB64).not.toBe(before.ivB64);

    // The migrated v2 ciphertext still opens with the SAME master password and
    // yields the EXACT original credentials — proves no data loss / no lockout.
    expect(decryptStoredVault(after, E2E_MASTER_PASSWORD)).toEqual({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      totpSecret: E2E_TOTP_SECRET,
    });
  });
});
