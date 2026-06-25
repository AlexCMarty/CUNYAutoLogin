import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  LEGACY_PBKDF2_ITERATIONS_V1,
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
 * Core PBKDF2 + AES-GCM derivation shared by the raw fabricators below. Lets tests
 * control the raw plaintext (bypassing encryptVault's JSON serialisation) and the
 * iteration count, to exercise decryptVault's payload-parsing branches and the
 * v1→v2 migration path independently.
 *
 * The sizes below are intentionally duplicated from vault.ts's private constants
 * (SALT_LENGTH = 32, IV_LENGTH = 12, AES_KEY_BITS = 256); the drift guard at the
 * bottom of this file fails loudly if vault.ts ever changes them.
 */
async function deriveAndEncrypt(
  plaintext: string,
  masterPassword: string,
  iterations: number
): Promise<{ salt: Uint8Array; iv: Uint8Array; ciphertext: ArrayBuffer }> {
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
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
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
  return { salt, iv, ciphertext };
}

/** Fabricate a current-format v2 blob (PBKDF2_ITERATIONS) for an arbitrary plaintext. */
async function encryptRaw(
  plaintext: string,
  masterPassword: string
): Promise<StoredVault> {
  const { salt, iv, ciphertext } = await deriveAndEncrypt(
    plaintext,
    masterPassword,
    PBKDF2_ITERATIONS
  );
  return {
    version: 2,
    iterations: PBKDF2_ITERATIONS,
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    ciphertextB64: bytesToB64(new Uint8Array(ciphertext)),
  };
}

/**
 * Fabricate a legacy v1 blob (LEGACY_PBKDF2_ITERATIONS_V1, no `iterations` field)
 * — the on-disk shape of a real pre-upgrade user. Proves backward-compatible
 * decrypt and the one-time migration to v2.
 */
async function encryptRawLegacyV1(
  plaintext: string,
  masterPassword: string
): Promise<StoredVault> {
  const { salt, iv, ciphertext } = await deriveAndEncrypt(
    plaintext,
    masterPassword,
    LEGACY_PBKDF2_ITERATIONS_V1
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

describe("backward compatibility — legacy v1 vaults still decrypt", () => {
  test("v1 blob (310k, no iterations field) decrypts with the right master password", async () => {
    const legacy = await encryptRawLegacyV1(JSON.stringify(PAYLOAD), MASTER);
    expect(legacy.version).toBe(1);
    expect(unwrap(await decryptVault(legacy, MASTER))).toEqual(PAYLOAD);
  });

  test("wrong master password against a legacy v1 blob → decrypt_failed", async () => {
    const legacy = await encryptRawLegacyV1(JSON.stringify(PAYLOAD), MASTER);
    expect(unwrapErr(await decryptVault(legacy, "wrong-password"))).toBe("decrypt_failed");
  });
});

describe("encryptVault writes the current v2 format", () => {
  test("output is version 2 and records the 600k iteration count", async () => {
    const stored = unwrap(await encryptVault(PAYLOAD, MASTER));
    expect(stored.version).toBe(2);
    if (stored.version === 2) {
      expect(stored.iterations).toBe(PBKDF2_ITERATIONS);
      expect(stored.iterations).toBe(600_000);
    }
    expect(unwrap(await decryptVault(stored, MASTER))).toEqual(PAYLOAD);
  });
});

// ── crypto/vault-v2-self-describing-iterations ───────────────────────────────
// v2's whole reason to exist over v1 is the self-describing `iterations` field:
// decrypt must derive at the count the BLOB carries, not at the PBKDF2_ITERATIONS
// constant. Every other v2 test happens to use 600k, so a bug that read the
// constant instead of the field would pass silently — and break the future
// work-factor bump / Argon2 (vault v3) migration this format was designed for.
describe("decryptVault — v2 is self-describing (derives at stored.iterations, not the constant)", () => {
  // A non-600k work factor: the assertions below only prove anything because it
  // differs from PBKDF2_ITERATIONS. Kept small so the derivations stay fast.
  const ALT_ITERATIONS = 200_000;

  test("a v2 blob at a non-600k iteration count decrypts at that count", async () => {
    expect(ALT_ITERATIONS).not.toBe(PBKDF2_ITERATIONS);
    const { salt, iv, ciphertext } = await deriveAndEncrypt(
      JSON.stringify(PAYLOAD),
      MASTER,
      ALT_ITERATIONS
    );
    const stored: StoredVault = {
      version: 2,
      iterations: ALT_ITERATIONS,
      saltB64: bytesToB64(salt),
      ivB64: bytesToB64(iv),
      ciphertextB64: bytesToB64(new Uint8Array(ciphertext)),
    };
    expect(unwrap(await decryptVault(stored, MASTER))).toEqual(PAYLOAD);
  });

  test("a v2 blob whose iterations field is wrong fails — decrypt derives at the stated count", async () => {
    // Encrypted at ALT_ITERATIONS but mislabelled PBKDF2_ITERATIONS. decryptVault
    // derives at the stated (wrong) count → key mismatch → decrypt_failed. If it
    // ignored the field and used the real count, this would wrongly succeed.
    const { salt, iv, ciphertext } = await deriveAndEncrypt(
      JSON.stringify(PAYLOAD),
      MASTER,
      ALT_ITERATIONS
    );
    const mislabelled: StoredVault = {
      version: 2,
      iterations: PBKDF2_ITERATIONS,
      saltB64: bytesToB64(salt),
      ivB64: bytesToB64(iv),
      ciphertextB64: bytesToB64(new Uint8Array(ciphertext)),
    };
    expect(unwrapErr(await decryptVault(mislabelled, MASTER))).toBe("decrypt_failed");
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

  test("version: 2 without an iterations field → false", () => {
    expect(isStoredVault({ ...valid, version: 2 })).toBe(false);
  });

  test("valid version: 2 with a numeric iterations field → true", () => {
    expect(isStoredVault({ ...valid, version: 2, iterations: 600_000 })).toBe(true);
  });

  test("version: 2 with a non-numeric iterations field → false", () => {
    expect(isStoredVault({ ...valid, version: 2, iterations: "600000" })).toBe(false);
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
  test("PBKDF2_ITERATIONS meets the current 600 000 OWASP floor", () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  test("PBKDF2_ITERATIONS is exactly 600 000", () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  test("LEGACY_PBKDF2_ITERATIONS_V1 stays 310 000 so existing v1 vaults keep decrypting", () => {
    expect(LEGACY_PBKDF2_ITERATIONS_V1).toBe(310_000);
  });

  test('VAULT_STORAGE_KEY is "cunyVault"', () => {
    expect(VAULT_STORAGE_KEY).toBe("cunyVault");
  });
});

describe("encryptVault crypto_failed — AES encrypt path", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("encryptVault returns crypto_failed when AES encrypt throws", async () => {
    vi.spyOn(globalThis.crypto.subtle, "encrypt").mockRejectedValueOnce(
      new Error("simulated AES-GCM encrypt failure")
    );
    expect(unwrapErr(await encryptVault(PAYLOAD, MASTER))).toBe("crypto_failed");
  });
});

describe("decryptVault — empty totpSecret is valid", () => {
  test("totpSecret empty string round-trips successfully", async () => {
    const payload: VaultPayload = { email: "a@login.cuny.edu", password: "pw", totpSecret: "" };
    const stored = unwrap(await encryptVault(payload, MASTER));
    expect(unwrap(await decryptVault(stored, MASTER))).toEqual(payload);
  });
});

describe("isStoredVault — additional edge cases", () => {
  const base: StoredVault = { version: 1, saltB64: "abc", ivB64: "def", ciphertextB64: "ghi" };

  test("ivB64 is a number → false", () => {
    expect(isStoredVault({ ...base, ivB64: 99 })).toBe(false);
  });

  test("ciphertextB64 is a number → false", () => {
    expect(isStoredVault({ ...base, ciphertextB64: 0 })).toBe(false);
  });

  test("ciphertextB64 is null → false", () => {
    expect(isStoredVault({ ...base, ciphertextB64: null })).toBe(false);
  });

  test("version: 0 → false", () => {
    expect(isStoredVault({ ...base, version: 0 })).toBe(false);
  });

  test("all fields present but version is undefined → false", () => {
    const { version: _v, ...noVersion } = base;
    expect(isStoredVault(noVersion)).toBe(false);
  });
});

// ── crypto/vault-decrypt-base64-throws [MEDIUM] ───────────────────────────────

describe("decryptVault — non-base64 fields return a Result, never throw", () => {
  const validBase: StoredVault = {
    version: 1,
    saltB64: btoa("somesalt"),
    ivB64: btoa("someiv"),
    ciphertextB64: btoa("someciphertext"),
  };

  test("non-base64 ciphertextB64 returns a Result (does not throw)", async () => {
    const result = await decryptVault(
      { ...validBase, ciphertextB64: "%%%not-base64%%%" },
      MASTER
    );
    // Must be a Result (Ok or Err) — if it throws, the test fails.
    expect(result.isOk() || result.isErr()).toBe(true);
  });

  test("non-base64 ivB64 returns a Result (does not throw)", async () => {
    const result = await decryptVault(
      { ...validBase, ivB64: "%%%not-base64%%%" },
      MASTER
    );
    expect(result.isOk() || result.isErr()).toBe(true);
  });

  test("non-base64 saltB64 returns a Result (does not throw)", async () => {
    const result = await decryptVault(
      { ...validBase, saltB64: "%%%not-base64%%%" },
      MASTER
    );
    expect(result.isOk() || result.isErr()).toBe(true);
  });
});

// ── crypto/vault-decrypt-failed-vs-crypto-failed [MEDIUM] ────────────────────

describe("decryptVault — error-code distinction: crypto_failed vs decrypt_failed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AES-GCM decrypt rejection maps to decrypt_failed (key derivation untouched)", async () => {
    // Encrypt a real vault so we have a structurally valid stored object.
    const stored = unwrap(await encryptVault(PAYLOAD, MASTER));

    // Leave deriveKey alone; only make AES-GCM decrypt reject.
    vi.spyOn(globalThis.crypto.subtle, "decrypt").mockRejectedValueOnce(
      new Error("simulated AES-GCM decrypt failure")
    );

    expect(unwrapErr(await decryptVault(stored, MASTER))).toBe("decrypt_failed");
  });
});

// ── crypto/vault-encryptraw-drift [LOW] ──────────────────────────────────────
// The deriveAndEncrypt helper hardcodes SALT_LENGTH (32) and IV_LENGTH (12) from
// vault.ts's private constants. This guard derives the real lengths from a live
// encryptVault output so changing those constants fails here loudly instead of
// letting the helper silently encrypt with stale sizes (masking genuine drift).
describe("encryptRaw helper stays in sync with vault.ts crypto params", () => {
  const b64ByteLen = (b64: string): number => atob(b64).length;

  test("real encryptVault salt/iv byte lengths match the helper's hardcoded sizes", async () => {
    const real = unwrap(await encryptVault(PAYLOAD, MASTER));
    expect(b64ByteLen(real.saltB64)).toBe(32); // SALT_LENGTH
    expect(b64ByteLen(real.ivB64)).toBe(12); // IV_LENGTH

    const raw = await encryptRaw("anything", MASTER);
    expect(b64ByteLen(raw.saltB64)).toBe(b64ByteLen(real.saltB64));
    expect(b64ByteLen(raw.ivB64)).toBe(b64ByteLen(real.ivB64));
  });
});
