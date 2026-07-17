/** Vault crypto and `StoredVault` wire shape; persistence uses `VAULT_STORAGE_KEY` in `browser.storage.local`. */

import { Result, ResultAsync, err, ok } from "neverthrow";
import { getArgon2id } from "./argon2idLoader";

export const VAULT_STORAGE_KEY = "cunyVault" as const;

/** Legacy v2 PBKDF2 work factor; retained for the v2 decrypt path. */
export const PBKDF2_ITERATIONS = 600_000;
/** Legacy v1 vaults were encrypted at this work factor; retained for the v1 decrypt path. */
export const LEGACY_PBKDF2_ITERATIONS_V1 = 310_000;

/** OWASP Argon2id minimum memory cost (KiB) — 19 MiB. */
export const ARGON2ID_MEMORY_KIB = 19 * 1024;
/** OWASP Argon2id minimum time cost (passes / iterations). */
export const ARGON2ID_PASSES = 2;
/** Single-threaded — browser WASM Argon2 without SharedArrayBuffer. */
export const ARGON2ID_PARALLELISM = 1;
/** 32-byte output → AES-256 key material. */
const ARGON2ID_TAG_LENGTH = 32;

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
 * - v1: implicit PBKDF2 at `LEGACY_PBKDF2_ITERATIONS_V1` (decrypt-only).
 * - v2: self-describing PBKDF2 via `iterations` (decrypt-only).
 * - v3: Argon2id with self-describing `{ memorySize, passes, parallelism }`.
 *   `encryptVault` always writes v3.
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

interface StoredVaultV3 {
  version: 3;
  memorySize: number;
  passes: number;
  parallelism: number;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
}

export type StoredVault = StoredVaultV1 | StoredVaultV2 | StoredVaultV3;

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

async function deriveAesKeyPbkdf2(
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

async function deriveAesKeyArgon2id(
  masterPassword: string,
  salt: Uint8Array,
  params: { memorySize: number; passes: number; parallelism: number }
): Promise<CryptoKey> {
  const argon2id = await getArgon2id();
  // Copy into a same-realm Uint8Array: jsdom / cross-realm typed arrays fail
  // argon2id's `instanceof Uint8Array` checks otherwise.
  const passwordBytes = new Uint8Array(new TextEncoder().encode(masterPassword));
  const saltBytes = new Uint8Array(salt);
  // Argon2id runs synchronously on this thread (WASM, no SharedArrayBuffer). At
  // OWASP-minimum params (~50–250 ms) that is acceptable; raising memory/passes
  // later would block the sidebar / service worker for longer.
  const rawKey = argon2id({
    password: passwordBytes,
    salt: saltBytes,
    parallelism: params.parallelism,
    passes: params.passes,
    memorySize: params.memorySize,
    tagLength: ARGON2ID_TAG_LENGTH,
  });
  return crypto.subtle.importKey(
    "raw",
    rawKey as BufferSource,
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

const aesGcmDecrypt = (
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array
): ResultAsync<VaultPayload, VaultError> =>
  ResultAsync.fromPromise(
    crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    ),
    () => "decrypt_failed" as const
  ).andThen((plain) => parseDecryptedPayload(plain));

export const encryptVault = (
  payload: VaultPayload,
  masterPassword: string
): ResultAsync<StoredVault, VaultError> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const argonParams = {
    memorySize: ARGON2ID_MEMORY_KIB,
    passes: ARGON2ID_PASSES,
    parallelism: ARGON2ID_PARALLELISM,
  };
  return ResultAsync.fromPromise(
    deriveAesKeyArgon2id(masterPassword, salt, argonParams),
    () => "crypto_failed" as const
  )
    .andThen((key) =>
      ResultAsync.fromPromise(
        crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv as BufferSource },
          key,
          plaintext
        ),
        () => "crypto_failed" as const
      )
    )
    .map((ciphertext) => ({
      version: 3 as const,
      memorySize: ARGON2ID_MEMORY_KIB,
      passes: ARGON2ID_PASSES,
      parallelism: ARGON2ID_PARALLELISM,
      saltB64: bytesToBase64(salt),
      ivB64: bytesToBase64(iv),
      ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
    }));
};

export const decryptVault = (
  stored: StoredVault,
  masterPassword: string
): ResultAsync<VaultPayload, VaultError> => {
  const decodeStoredBytes = Result.fromThrowable(
    () => ({
      salt: base64ToBytes(stored.saltB64),
      iv: base64ToBytes(stored.ivB64),
      ciphertext: base64ToBytes(stored.ciphertextB64),
    }),
    () => "invalid_payload" as const
  );
  return decodeStoredBytes().asyncAndThen(({ salt, iv, ciphertext }) => {
    if (stored.version === 3) {
      return ResultAsync.fromPromise(
        deriveAesKeyArgon2id(masterPassword, salt, {
          memorySize: stored.memorySize,
          passes: stored.passes,
          parallelism: stored.parallelism,
        }),
        () => "crypto_failed" as const
      ).andThen((key) => aesGcmDecrypt(key, iv, ciphertext));
    }
    const iterations =
      stored.version === 2 ? stored.iterations : LEGACY_PBKDF2_ITERATIONS_V1;
    return ResultAsync.fromPromise(
      deriveAesKeyPbkdf2(masterPassword, salt, iterations),
      () => "crypto_failed" as const
    ).andThen((key) => aesGcmDecrypt(key, iv, ciphertext));
  });
};

export const isStoredVault = (value: unknown): value is StoredVault => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const hasBlobFields =
    typeof candidate.saltB64 === "string" &&
    typeof candidate.ivB64 === "string" &&
    typeof candidate.ciphertextB64 === "string";
  if (!hasBlobFields) return false;
  if (candidate.version === 1) return true;
  if (candidate.version === 2) return typeof candidate.iterations === "number";
  if (candidate.version === 3) {
    return (
      typeof candidate.memorySize === "number" &&
      typeof candidate.passes === "number" &&
      typeof candidate.parallelism === "number"
    );
  }
  return false;
};
