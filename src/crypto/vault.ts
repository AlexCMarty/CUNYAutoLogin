/** Encrypted credential blob stored in browser.storage.local */

export const VAULT_STORAGE_KEY = "cunyVault" as const;

export const PBKDF2_ITERATIONS = 310_000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const AES_KEY_BITS = 256;

export interface VaultPayload {
  email: string;
  password: string;
  totpSecret: string;
}

/** Wire format persisted to storage (no plaintext secrets). */
export interface StoredVault {
  version: 1;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
}

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
  salt: Uint8Array
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
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVault(
  payload: VaultPayload,
  masterPassword: string
): Promise<StoredVault> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveAesKey(masterPassword, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext
  );
  return {
    version: 1,
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptVault(
  stored: StoredVault,
  masterPassword: string
): Promise<VaultPayload> {
  const salt = base64ToBytes(stored.saltB64);
  const iv = base64ToBytes(stored.ivB64);
  const ciphertext = base64ToBytes(stored.ciphertextB64);
  const key = await deriveAesKey(masterPassword, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
  } catch {
    throw new Error("DECRYPT_FAILED");
  }
  const json = new TextDecoder().decode(plaintext);
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("email" in parsed) ||
    !("password" in parsed) ||
    !("totpSecret" in parsed)
  ) {
    throw new Error("INVALID_PAYLOAD");
  }
  const o = parsed as Record<string, unknown>;
  const email = o.email;
  const password = o.password;
  const totpSecret = o.totpSecret;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof totpSecret !== "string"
  ) {
    throw new Error("INVALID_PAYLOAD");
  }
  return { email, password, totpSecret };
}

export function isStoredVault(value: unknown): value is StoredVault {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.saltB64 === "string" &&
    typeof v.ivB64 === "string" &&
    typeof v.ciphertextB64 === "string"
  );
}
