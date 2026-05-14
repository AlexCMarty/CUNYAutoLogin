import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  PBKDF2_ITERATIONS,
  VAULT_STORAGE_KEY,
  decryptVault,
  encryptVault,
  isStoredVault,
} from "./vault";
import type { StoredVault, VaultPayload } from "./vault";
import { unwrap, unwrapErr } from "../testUtils/resultUnwrap";

const PAYLOAD: VaultPayload = {
  email: "student@login.cuny.edu",
  password: "hunter2",
  totpSecret: "JBSWY3DPEHPK3PXP",
};
const MASTER = "correct-horse-battery-staple";

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** XOR the middle byte of the decoded data so the base64 round-trips to different bytes. */
function tamperB64(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from({ length: binary.length }, (_, i) =>
    binary.charCodeAt(i)
  );
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;
  return bytesToB64(bytes);
}

/**
 * Encrypt an arbitrary plaintext string using the same crypto params as vault.ts.
 * Bypasses encryptVault's JSON serialisation so tests can control the raw plaintext
 * and exercise decryptVault's payload-parsing branches independently.
 *
 * The three sizes below are intentionally duplicated from vault.ts's private constants
 * (SALT_LENGTH = 32, IV_LENGTH = 12, AES_KEY_BITS = 256). They cannot be imported,
 * so if vault.ts ever changes them this helper must be updated to match.
 */
async function encryptRaw(
  plaintext: string,
  masterPassword: string
): Promise<StoredVault> {
  const salt = crypto.getRandomValues(new Uint8Array(32));  // must match SALT_LENGTH
  const iv = crypto.getRandomValues(new Uint8Array(12));    // must match IV_LENGTH
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },  // must match AES_KEY_BITS
    false,
    ["encrypt", "decrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  return {
    version: 1,
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    ciphertextB64: bytesToB64(new Uint8Array(ciphertext)),
  };
}

// eslint-disable-next-line max-lines-per-function
describe("encryptVault + decryptVault", () => {
  describe("round-trip correctness", () => {
    test("standard payload", async () => {
      const stored = unwrap(await encryptVault(PAYLOAD, MASTER));
      expect(unwrap(await decryptVault(stored, MASTER))).toEqual(PAYLOAD);
    });

    test("unicode characters in password", async () => {
      const payload = { ...PAYLOAD, password: "p@$$w0rd™éàü" };
      const stored = unwrap(await encryptVault(payload, MASTER));
      expect(unwrap(await decryptVault(stored, MASTER))).toEqual(payload);
    });

    test("special characters in all fields", async () => {
      const payload: VaultPayload = {
        email: "ünïcödé@login.cuny.edu",
        password: "🔐<>\"&'\\/",
        totpSecret: "ÀÁÂÃÄÅÆÇÈÉ",
      };
      const stored = unwrap(await encryptVault(payload, MASTER));
      expect(unwrap(await decryptVault(stored, MASTER))).toEqual(payload);
    });

    test("empty-string master password", async () => {
      const stored = unwrap(await encryptVault(PAYLOAD, ""));
      expect(unwrap(await decryptVault(stored, ""))).toEqual(PAYLOAD);
    });

    test("256-character master password", async () => {
      const longMaster = "x".repeat(256);
      const stored = unwrap(await encryptVault(PAYLOAD, longMaster));
      expect(unwrap(await decryptVault(stored, longMaster))).toEqual(PAYLOAD);
    });
  });

  describe("wrong / mismatched master password → decrypt_failed", () => {
    test("entirely wrong password", async () => {
      const stored = unwrap(await encryptVault(PAYLOAD, MASTER));
      expect(unwrapErr(await decryptVault(stored, "wrong-password"))).toBe("decrypt_failed");
    });

    test("correct password used to encrypt, empty string used to decrypt", async () => {
      const stored = unwrap(await encryptVault(PAYLOAD, MASTER));
      expect(unwrapErr(await decryptVault(stored, ""))).toBe("decrypt_failed");
    });

    test("empty string used to encrypt, correct password used to decrypt", async () => {
      const stored = unwrap(await encryptVault(PAYLOAD, ""));
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("decrypt_failed");
    });
  });

  describe("tampered StoredVault → decrypt_failed", () => {
    let stored: StoredVault;
    beforeEach(async () => {
      stored = unwrap(await encryptVault(PAYLOAD, MASTER));
    });

    test("flipped byte in ciphertextB64", async () => {
      const result = await decryptVault(
        { ...stored, ciphertextB64: tamperB64(stored.ciphertextB64) },
        MASTER
      );
      expect(unwrapErr(result)).toBe("decrypt_failed");
    });

    test("flipped byte in ivB64", async () => {
      const result = await decryptVault(
        { ...stored, ivB64: tamperB64(stored.ivB64) },
        MASTER
      );
      expect(unwrapErr(result)).toBe("decrypt_failed");
    });

    test("flipped byte in saltB64", async () => {
      const result = await decryptVault(
        { ...stored, saltB64: tamperB64(stored.saltB64) },
        MASTER
      );
      expect(unwrapErr(result)).toBe("decrypt_failed");
    });

    test("random garbage as ciphertextB64", async () => {
      const result = await decryptVault(
        { ...stored, ciphertextB64: btoa("totallynotciphertext") },
        MASTER
      );
      expect(unwrapErr(result)).toBe("decrypt_failed");
    });
  });

  describe("bad decrypted content → invalid_payload", () => {
    test("plaintext is not JSON", async () => {
      const stored = await encryptRaw("not json at all", MASTER);
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("invalid_payload");
    });

    test("plaintext is an empty JSON object", async () => {
      const stored = await encryptRaw("{}", MASTER);
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("invalid_payload");
    });

    test("missing totpSecret field", async () => {
      const stored = await encryptRaw(
        JSON.stringify({ email: "a@login.cuny.edu", password: "x" }),
        MASTER
      );
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("invalid_payload");
    });

    test("missing password field", async () => {
      const stored = await encryptRaw(
        JSON.stringify({ email: "a@login.cuny.edu", totpSecret: "S" }),
        MASTER
      );
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("invalid_payload");
    });

    test("missing email field", async () => {
      const stored = await encryptRaw(
        JSON.stringify({ password: "x", totpSecret: "S" }),
        MASTER
      );
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("invalid_payload");
    });

    test("email is a number, not a string", async () => {
      const stored = await encryptRaw(
        JSON.stringify({ email: 1, password: "x", totpSecret: "S" }),
        MASTER
      );
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("invalid_payload");
    });

    test("password is null", async () => {
      const stored = await encryptRaw(
        JSON.stringify({ email: "a@login.cuny.edu", password: null, totpSecret: "S" }),
        MASTER
      );
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("invalid_payload");
    });

    test("totpSecret is an object", async () => {
      const stored = await encryptRaw(
        JSON.stringify({ email: "a@login.cuny.edu", password: "x", totpSecret: {} }),
        MASTER
      );
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("invalid_payload");
    });
  });

  describe("randomness — each encryption is unique", () => {
    test("two encryptions of the same payload produce different saltB64", async () => {
      const first = unwrap(await encryptVault(PAYLOAD, MASTER));
      const second = unwrap(await encryptVault(PAYLOAD, MASTER));
      expect(first.saltB64).not.toBe(second.saltB64);
    });

    test("two encryptions produce different ivB64", async () => {
      const first = unwrap(await encryptVault(PAYLOAD, MASTER));
      const second = unwrap(await encryptVault(PAYLOAD, MASTER));
      expect(first.ivB64).not.toBe(second.ivB64);
    });

    test("two encryptions produce different ciphertextB64", async () => {
      const first = unwrap(await encryptVault(PAYLOAD, MASTER));
      const second = unwrap(await encryptVault(PAYLOAD, MASTER));
      expect(first.ciphertextB64).not.toBe(second.ciphertextB64);
    });
  });

  describe("crypto_failed path", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    test("encryptVault returns crypto_failed when key derivation throws", async () => {
      vi.spyOn(globalThis.crypto.subtle, "deriveKey").mockRejectedValueOnce(
        new Error("simulated WebCrypto failure")
      );
      expect(unwrapErr(await encryptVault(PAYLOAD, MASTER))).toBe("crypto_failed");
    });

    test("decryptVault returns crypto_failed when key derivation throws", async () => {
      const stored = unwrap(await encryptVault(PAYLOAD, MASTER));
      vi.spyOn(globalThis.crypto.subtle, "deriveKey").mockRejectedValueOnce(
        new Error("simulated WebCrypto failure")
      );
      expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("crypto_failed");
    });
  });
});

describe("isStoredVault", () => {
  const valid: StoredVault = {
    version: 1,
    saltB64: "abc",
    ivB64: "def",
    ciphertextB64: "ghi",
  };

  test("valid StoredVault → true", () => {
    expect(isStoredVault(valid)).toBe(true);
  });

  test("valid object with extra unknown fields → true", () => {
    expect(isStoredVault({ ...valid, extra: "ignored" })).toBe(true);
  });

  test("null → false", () => {
    expect(isStoredVault(null)).toBe(false);
  });

  test("undefined → false", () => {
    expect(isStoredVault(undefined)).toBe(false);
  });

  test("string → false", () => {
    expect(isStoredVault("not an object")).toBe(false);
  });

  test("array → false", () => {
    expect(isStoredVault([])).toBe(false);
  });

  test("empty object → false", () => {
    expect(isStoredVault({})).toBe(false);
  });

  test("version: 2 → false", () => {
    expect(isStoredVault({ ...valid, version: 2 })).toBe(false);
  });

  test('version: "1" (string instead of number) → false', () => {
    expect(isStoredVault({ ...valid, version: "1" })).toBe(false);
  });

  test("saltB64 is a number → false", () => {
    expect(isStoredVault({ ...valid, saltB64: 42 })).toBe(false);
  });

  test("missing saltB64 → false", () => {
    const { saltB64: _s, ...rest } = valid;
    expect(isStoredVault(rest)).toBe(false);
  });

  test("missing ivB64 → false", () => {
    const { ivB64: _i, ...rest } = valid;
    expect(isStoredVault(rest)).toBe(false);
  });

  test("missing ciphertextB64 → false", () => {
    const { ciphertextB64: _c, ...rest } = valid;
    expect(isStoredVault(rest)).toBe(false);
  });

  test("ivB64: null → false", () => {
    expect(isStoredVault({ ...valid, ivB64: null })).toBe(false);
  });
});

describe("constants", () => {
  test("PBKDF2_ITERATIONS meets the 310 000 security floor", () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(310_000);
  });

  test('VAULT_STORAGE_KEY is "cunyVault"', () => {
    expect(VAULT_STORAGE_KEY).toBe("cunyVault");
  });
});
