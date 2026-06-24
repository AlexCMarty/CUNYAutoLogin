/** PBKDF2 + AES-GCM vault crypto and `StoredVault` wire shape; persistence uses `VAULT_STORAGE_KEY` in `browser.storage.local`. */

import { Result, ResultAsync, err, ok } from "neverthrow";

export const VAULT_STORAGE_KEY = "cunyVault" as const;

export const PBKDF2_ITERATIONS = 600_000;
/** Legacy v1 vaults were encrypted at this work factor; retained for the v1 decrypt path and one-time migration to v2. */
export const LEGACY_PBKDF2_ITERATIONS_V1 = 310_000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const AES_KEY_BITS = 256;

export type VaultError = "decrypt_failed" | "invalid_payload" | "crypto_failed";

export interface VaultPayload {
  email: string;
  password: string;
  totpSecret: string;
}

/**
 * Wire format persisted to storage (no plaintext secrets).
 *
 * v1 (legacy) has no `iterations` field and is implicitly PBKDF2 at
 * `LEGACY_PBKDF2_ITERATIONS_V1`. v2 is self-describing — it stores its own
 * iteration count so the work factor can be raised again (or swapped for a
 * different KDF's params) without another format break. `decryptVault` reads
 * both; `encryptVault` always writes v2.
 */
interface StoredVaultV1 {
  version: 1;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
}

interface StoredVaultV2 {
  version: 2;
  iterations: number;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
}

export type StoredVault = StoredVaultV1 | StoredVaultV2;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveAesKey(
  masterPassword: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

function parseDecryptedPayload(plaintext: ArrayBuffer): Result<VaultPayload, VaultError> {
  const json = new TextDecoder().decode(plaintext);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return err("invalid_payload");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("email" in parsed) ||
    !("password" in parsed) ||
    !("totpSecret" in parsed)
  ) {
    return err("invalid_payload");
  }
  const parsedPayload = parsed as Record<string, unknown>;
  const email = parsedPayload.email;
  const password = parsedPayload.password;
  const totpSecret = parsedPayload.totpSecret;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof totpSecret !== "string"
  ) {
    return err("invalid_payload");
  }
  return ok({ email, password, totpSecret });
}

export const encryptVault = (
  payload: VaultPayload,
  masterPassword: string
): ResultAsync<StoredVault, VaultError> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  return ResultAsync.fromPromise(deriveAesKey(masterPassword, salt, PBKDF2_ITERATIONS), () => "crypto_failed" as const).andThen(
    (key) =>
      ResultAsync.fromPromise(
        crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv as BufferSource },
          key,
          plaintext
        ),
        () => "crypto_failed" as const
      )
  ).map((ciphertext) => ({
    version: 2 as const,
    iterations: PBKDF2_ITERATIONS,
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
  }));
};

export const decryptVault = (
  stored: StoredVault,
  masterPassword: string
): ResultAsync<VaultPayload, VaultError> => {
  // v1 vaults predate the self-describing format and were encrypted at the
  // legacy work factor; v2 carries its own iteration count.
  const iterations =
    stored.version === 2 ? stored.iterations : LEGACY_PBKDF2_ITERATIONS_V1;
  // Decode the stored base64 fields up front. `atob` throws synchronously on
  // non-base64 input (corrupt/tampered storage), so guard it as a Result rather
  // than letting the exception escape the ResultAsync contract.
  const decodeStoredBytes = Result.fromThrowable(
    () => ({
      salt: base64ToBytes(stored.saltB64),
      iv: base64ToBytes(stored.ivB64),
      ciphertext: base64ToBytes(stored.ciphertextB64),
    }),
    () => "invalid_payload" as const
  );
  return decodeStoredBytes().asyncAndThen(({ salt, iv, ciphertext }) =>
    ResultAsync.fromPromise(deriveAesKey(masterPassword, salt, iterations), () => "crypto_failed" as const)
      .andThen((key) =>
        ResultAsync.fromPromise(
          crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv as BufferSource },
            key,
            ciphertext as BufferSource
          ),
          () => "decrypt_failed" as const
        )
      )
      .andThen((plain) => parseDecryptedPayload(plain))
  );
};

export const isStoredVault = (value: unknown): value is StoredVault => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const hasBlobFields =
    typeof candidate.saltB64 === "string" &&
    typeof candidate.ivB64 === "string" &&
    typeof candidate.ciphertextB64 === "string";
  if (!hasBlobFields) return false;
  // v1 is implicitly the legacy work factor; v2 must carry a numeric iteration count.
  if (candidate.version === 1) return true;
  if (candidate.version === 2) return typeof candidate.iterations === "number";
  return false;
};
