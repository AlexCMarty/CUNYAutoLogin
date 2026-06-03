// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import browser from "webextension-polyfill";

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
  },
}));

import {
  BIOMETRIC_STORAGE_KEY,
  isBiometricEnrolled,
  clearBiometricCredential,
  enrollBiometric,
  unlockWithBiometric,
} from "./biometric";

afterEach(() => {
  vi.resetAllMocks();
});

// ── BIOMETRIC_STORAGE_KEY constant ────────────────────────────────────────────

describe("constants", () => {
  test("BIOMETRIC_STORAGE_KEY is a non-empty string", () => {
    expect(typeof BIOMETRIC_STORAGE_KEY).toBe("string");
    expect(BIOMETRIC_STORAGE_KEY.length).toBeGreaterThan(0);
  });
});

// ── isBiometricEnrolled ───────────────────────────────────────────────────────

describe("isBiometricEnrolled", () => {
  test("returns false when storage has no credential", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    expect(await isBiometricEnrolled()).toBe(false);
  });

  test("returns false when stored value is null", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({ [BIOMETRIC_STORAGE_KEY]: null });
    expect(await isBiometricEnrolled()).toBe(false);
  });

  test("returns false when stored value is not a valid StoredBiometricCredential", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: { not: "a credential" },
    });
    expect(await isBiometricEnrolled()).toBe(false);
  });

  test("returns false when version field is wrong", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: {
        version: 2,
        credentialIdB64: "abc",
        transports: [],
        prfSaltB64: "def",
        ivB64: "ghi",
        wrappedMasterB64: "jkl",
      },
    });
    expect(await isBiometricEnrolled()).toBe(false);
  });

  test("returns true when a valid credential exists in storage", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: {
        version: 1,
        credentialIdB64: "abc",
        transports: ["internal"],
        prfSaltB64: "def",
        ivB64: "ghi",
        wrappedMasterB64: "jkl",
      },
    });
    expect(await isBiometricEnrolled()).toBe(true);
  });

  test("returns false and does not throw when storage.local.get rejects", async () => {
    vi.mocked(browser.storage.local.get).mockRejectedValue(new Error("storage failure"));
    expect(await isBiometricEnrolled()).toBe(false);
  });
});

// ── clearBiometricCredential ──────────────────────────────────────────────────

describe("clearBiometricCredential", () => {
  test("calls browser.storage.local.remove with the storage key", async () => {
    vi.mocked(browser.storage.local.remove).mockResolvedValue(undefined);
    await clearBiometricCredential();
    expect(vi.mocked(browser.storage.local.remove)).toHaveBeenCalledWith(BIOMETRIC_STORAGE_KEY);
  });

  test("does not throw when storage.local.remove rejects", async () => {
    vi.mocked(browser.storage.local.remove).mockRejectedValue(new Error("remove failed"));
    await expect(clearBiometricCredential()).resolves.toBeUndefined();
  });
});

// ── enrollBiometric error mapping ─────────────────────────────────────────────

// jsdom does not implement navigator.credentials or PublicKeyCredential — install stubs.
class FakePublicKeyCredential {
  rawId: ArrayBuffer;
  id: string;
  type: string;
  getClientExtensionResults: () => AuthenticationExtensionsClientOutputs;

  constructor() {
    this.rawId = new ArrayBuffer(16);
    this.id = "fake-id";
    this.type = "public-key";
    this.getClientExtensionResults = () => ({});
  }
}

function installCredentialsStub(): void {
  if (typeof globalThis.PublicKeyCredential === "undefined") {
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: FakePublicKeyCredential,
      configurable: true,
      writable: true,
    });
  }
  if (!navigator.credentials) {
    Object.defineProperty(navigator, "credentials", {
      value: {
        create: vi.fn(),
        get: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
  }
}

describe("enrollBiometric — error mapping", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns user_cancelled when credentials.create throws NotAllowedError", async () => {
    const domErr = new DOMException("User cancelled", "NotAllowedError");
    vi.spyOn(navigator.credentials, "create").mockRejectedValue(domErr);
    const result = await enrollBiometric("somemaster");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("user_cancelled");
  });

  test("returns user_cancelled when credentials.create throws AbortError", async () => {
    const domErr = new DOMException("Aborted", "AbortError");
    vi.spyOn(navigator.credentials, "create").mockRejectedValue(domErr);
    const result = await enrollBiometric("somemaster");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("user_cancelled");
  });

  test("returns unsupported_browser when credentials.create throws SecurityError", async () => {
    const domErr = new DOMException("Security", "SecurityError");
    vi.spyOn(navigator.credentials, "create").mockRejectedValue(domErr);
    const result = await enrollBiometric("somemaster");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("unsupported_browser");
  });

  test("returns unsupported_browser when credentials.create throws NotSupportedError", async () => {
    const domErr = new DOMException("Not supported", "NotSupportedError");
    vi.spyOn(navigator.credentials, "create").mockRejectedValue(domErr);
    const result = await enrollBiometric("somemaster");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("unsupported_browser");
  });

  test("returns unsupported_browser when credentials.create throws InvalidStateError", async () => {
    const domErr = new DOMException("Invalid state", "InvalidStateError");
    vi.spyOn(navigator.credentials, "create").mockRejectedValue(domErr);
    const result = await enrollBiometric("somemaster");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("unsupported_browser");
  });

  test("returns crypto_error for an unknown Error", async () => {
    vi.spyOn(navigator.credentials, "create").mockRejectedValue(new Error("unknown"));
    const result = await enrollBiometric("somemaster");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("crypto_error");
  });
});

// ── unlockWithBiometric error mapping ─────────────────────────────────────────

const STORED_CREDENTIAL_FIXTURE = {
  version: 1,
  credentialIdB64: "AAAA",
  transports: ["internal"],
  prfSaltB64: "BBBB",
  ivB64: "CCCC",
  wrappedMasterB64: "DDDD",
};

describe("unlockWithBiometric — error mapping", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns not_enrolled when no credential is stored", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    const result = await unlockWithBiometric();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("not_enrolled");
  });

  test("returns user_cancelled when credentials.get throws NotAllowedError", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: STORED_CREDENTIAL_FIXTURE,
    });
    vi.spyOn(navigator.credentials, "get").mockRejectedValue(
      new DOMException("User cancelled", "NotAllowedError")
    );
    const result = await unlockWithBiometric();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("user_cancelled");
  });

  test("returns unsupported_browser when credentials.get throws SecurityError", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: STORED_CREDENTIAL_FIXTURE,
    });
    vi.spyOn(navigator.credentials, "get").mockRejectedValue(
      new DOMException("Security", "SecurityError")
    );
    const result = await unlockWithBiometric();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("unsupported_browser");
  });

  test("returns unsupported_browser when credentials.get throws NotSupportedError", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: STORED_CREDENTIAL_FIXTURE,
    });
    vi.spyOn(navigator.credentials, "get").mockRejectedValue(
      new DOMException("Not supported", "NotSupportedError")
    );
    const result = await unlockWithBiometric();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("unsupported_browser");
  });

  test("returns unsupported_browser when credentials.get throws InvalidStateError", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: STORED_CREDENTIAL_FIXTURE,
    });
    vi.spyOn(navigator.credentials, "get").mockRejectedValue(
      new DOMException("Invalid state", "InvalidStateError")
    );
    const result = await unlockWithBiometric();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("unsupported_browser");
  });
});

describe("unlockWithBiometric — additional error paths", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns crypto_error when credentials.get throws unknown error", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: STORED_CREDENTIAL_FIXTURE,
    });
    vi.spyOn(navigator.credentials, "get").mockRejectedValue(new Error("unexpected"));
    const result = await unlockWithBiometric();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("crypto_error");
  });

  test("returns prf_unavailable when credentials.get returns credential with no PRF output", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: STORED_CREDENTIAL_FIXTURE,
    });
    const fakeCredential = new FakePublicKeyCredential() as unknown as PublicKeyCredential;
    vi.spyOn(navigator.credentials, "get").mockResolvedValue(fakeCredential);
    const result = await unlockWithBiometric();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("prf_unavailable");
  });
});

// ── enrollBiometric — prf_unavailable when prf.enabled === false ─────────────

describe("enrollBiometric — prf.enabled=false → prf_unavailable", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns prf_unavailable when platform returns prf.enabled=false", async () => {
    const fakeCredential = new FakePublicKeyCredential() as unknown as PublicKeyCredential;
    const fakeAttestResponse = {
      getTransports: () => ["internal"],
    } as unknown as AuthenticatorAttestationResponse;
    Object.defineProperty(fakeCredential, "response", { value: fakeAttestResponse });
    fakeCredential.getClientExtensionResults = () =>
      ({ prf: { enabled: false } } as AuthenticationExtensionsClientOutputs);
    vi.spyOn(navigator.credentials, "create").mockResolvedValue(fakeCredential);
    const result = await enrollBiometric("somemaster");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("prf_unavailable");
  });
});

// ── BIOMETRIC_STORAGE_KEY constant — pinned literal ───────────────────────────

describe("BIOMETRIC_STORAGE_KEY literal value", () => {
  test('BIOMETRIC_STORAGE_KEY is "cunyBiometricCredential"', () => {
    expect(BIOMETRIC_STORAGE_KEY).toBe("cunyBiometricCredential");
  });
});

// ── isBiometricEnrolled — additional shape checks ─────────────────────────────

describe("isBiometricEnrolled — additional shape checks", () => {
  test("returns false when transports is not an array", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: {
        version: 1,
        credentialIdB64: "abc",
        transports: "internal",  // should be array
        prfSaltB64: "def",
        ivB64: "ghi",
        wrappedMasterB64: "jkl",
      },
    });
    expect(await isBiometricEnrolled()).toBe(false);
  });

  test("returns false when credentialIdB64 is missing", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: {
        version: 1,
        transports: [],
        prfSaltB64: "def",
        ivB64: "ghi",
        wrappedMasterB64: "jkl",
      },
    });
    expect(await isBiometricEnrolled()).toBe(false);
  });

  test("returns false when wrappedMasterB64 is a number", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [BIOMETRIC_STORAGE_KEY]: {
        version: 1,
        credentialIdB64: "abc",
        transports: [],
        prfSaltB64: "def",
        ivB64: "ghi",
        wrappedMasterB64: 42,
      },
    });
    expect(await isBiometricEnrolled()).toBe(false);
  });
});

// ── Shared helpers for PRF-based integration tests ────────────────────────────

/** Build a 32-byte deterministic ArrayBuffer for use as a fake PRF secret. */
function makePrfOutput(fillByte = 0x42): ArrayBuffer {
  return new Uint8Array(32).fill(fillByte).buffer;
}

/**
 * Build a FakePublicKeyCredential that looks like a response from
 * `navigator.credentials.create()` and includes a PRF output in its
 * extension results. Used by enroll + unlock integration tests.
 */
function makeCreateCredential(options: {
  prfOutput?: ArrayBuffer;
  prfEnabled?: boolean;
  getTransports?: () => string[];
  rawId?: ArrayBuffer;
}): PublicKeyCredential {
  const rawId = options.rawId ?? new Uint8Array(16).fill(0xab).buffer;
  const cred = new FakePublicKeyCredential() as unknown as PublicKeyCredential;
  Object.defineProperty(cred, "rawId", { value: rawId, configurable: true });

  const prfResults =
    options.prfOutput !== undefined
      ? { enabled: true, results: { first: options.prfOutput } }
      : options.prfEnabled !== undefined
      ? { enabled: options.prfEnabled }
      : { enabled: true };

  cred.getClientExtensionResults = () =>
    ({ prf: prfResults } as unknown as AuthenticationExtensionsClientOutputs);

  const fakeAttest: Partial<AuthenticatorAttestationResponse> = {};
  if (options.getTransports) {
    fakeAttest.getTransports = options.getTransports;
  }
  Object.defineProperty(cred, "response", {
    value: fakeAttest,
    configurable: true,
  });

  return cred;
}

/**
 * Build a FakePublicKeyCredential that looks like a response from
 * `navigator.credentials.get()` and includes a PRF output.
 */
function makeAssertionCredential(prfOutput: ArrayBuffer): PublicKeyCredential {
  const cred = new FakePublicKeyCredential() as unknown as PublicKeyCredential;
  cred.getClientExtensionResults = () =>
    ({
      prf: { results: { first: prfOutput } },
    } as unknown as AuthenticationExtensionsClientOutputs);
  return cred;
}

// ── crypto/biometric-enroll-roundtrip [CRITICAL] ──────────────────────────────

describe("enrollBiometric + unlockWithBiometric — round-trip", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Run a full enroll-then-unlock cycle with the given master password. */
  async function roundTrip(master: string): Promise<string> {
    const prfOutput = makePrfOutput(0x42);

    // Capture what enrollBiometric stores so unlockWithBiometric can read it back.
    let storedBlob: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      storedBlob = obj as Record<string, unknown>;
    });

    const createCred = makeCreateCredential({ prfOutput });
    vi.spyOn(navigator.credentials, "create").mockResolvedValue(createCred);

    const enrollResult = await enrollBiometric(master);
    expect(enrollResult.isOk(), `enroll failed: ${JSON.stringify(enrollResult)}`).toBe(true);

    // Provide stored blob to unlockWithBiometric via storage.local.get.
    vi.mocked(browser.storage.local.get).mockResolvedValue(storedBlob);

    const assertCred = makeAssertionCredential(prfOutput);
    vi.spyOn(navigator.credentials, "get").mockResolvedValue(assertCred);

    const unlockResult = await unlockWithBiometric();
    expect(unlockResult.isOk(), `unlock failed: ${JSON.stringify(unlockResult)}`).toBe(true);
    return unlockResult.isOk() ? unlockResult.value : "";
  }

  test("standard master password round-trips verbatim", async () => {
    expect(await roundTrip("correct-horse-battery-staple")).toBe("correct-horse-battery-staple");
  });

  test("unicode master password round-trips verbatim", async () => {
    expect(await roundTrip("p@$$w0rd™éàü🔐")).toBe("p@$$w0rd™éàü🔐");
  });

  test("empty master password round-trips verbatim", async () => {
    expect(await roundTrip("")).toBe("");
  });

  test("256-character master password round-trips verbatim", async () => {
    const long = "x".repeat(256);
    expect(await roundTrip(long)).toBe(long);
  });
});

// ── crypto/biometric-no-plaintext-stored [CRITICAL] ──────────────────────────

describe("enrollBiometric — no plaintext stored", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("storage.local.set receives a valid StoredBiometricCredential shape with version:1", async () => {
    const prfOutput = makePrfOutput(0x11);
    let capturedArg: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      capturedArg = obj as Record<string, unknown>;
    });
    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfOutput, getTransports: () => ["internal"] })
    );

    const result = await enrollBiometric("S3cret!");
    expect(result.isOk()).toBe(true);

    const stored = capturedArg[BIOMETRIC_STORAGE_KEY] as Record<string, unknown>;
    expect(stored).toBeTruthy();
    expect(stored.version).toBe(1);
    expect(typeof stored.credentialIdB64).toBe("string");
    expect(Array.isArray(stored.transports)).toBe(true);
    expect(typeof stored.prfSaltB64).toBe("string");
    expect(typeof stored.ivB64).toBe("string");
    expect(typeof stored.wrappedMasterB64).toBe("string");
  });

  test("the serialized storage blob does NOT contain the plaintext master", async () => {
    const master = "S3cret!";
    const prfOutput = makePrfOutput(0x22);
    let capturedArg: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      capturedArg = obj as Record<string, unknown>;
    });
    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfOutput })
    );

    await enrollBiometric(master);

    const serialized = JSON.stringify(capturedArg);
    expect(serialized).not.toContain(master);
  });

  test("wrappedMasterB64 decrypts back to the master only with the correct PRF-derived key", async () => {
    const master = "S3cret!";
    const prfOutput = makePrfOutput(0x33);
    let capturedArg: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      capturedArg = obj as Record<string, unknown>;
    });
    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfOutput })
    );

    await enrollBiometric(master);

    const stored = capturedArg[BIOMETRIC_STORAGE_KEY] as {
      ivB64: string;
      wrappedMasterB64: string;
    };

    // Decode helpers (mirrors biometric.ts internals without importing them).
    const b64ToBytes = (b64: string): Uint8Array => {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };

    const iv = b64ToBytes(stored.ivB64) as unknown as BufferSource;
    const wrappedMaster = b64ToBytes(stored.wrappedMasterB64) as unknown as BufferSource;

    // Correct PRF key → must decrypt to master.
    const aesKey = await crypto.subtle.importKey("raw", prfOutput, "AES-GCM", false, ["decrypt"]);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, wrappedMaster);
    expect(new TextDecoder().decode(plainBuf)).toBe(master);

    // Wrong PRF key → must fail.
    const wrongKey = await crypto.subtle.importKey(
      "raw",
      makePrfOutput(0xff),
      "AES-GCM",
      false,
      ["decrypt"]
    );
    await expect(
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrongKey, wrappedMaster)
    ).rejects.toThrow();
  });
});

// ── crypto/biometric-prf-from-create [HIGH] ───────────────────────────────────

describe("enrollBiometric — PRF source selection", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("when create() returns PRF output, credentials.get is NOT called", async () => {
    const prfOutput = makePrfOutput(0x44);
    let storedBlob: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      storedBlob = obj as Record<string, unknown>;
    });

    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfOutput, getTransports: () => ["internal"] })
    );
    const getSpy = vi.spyOn(navigator.credentials, "get");

    const result = await enrollBiometric("masterA");
    expect(result.isOk()).toBe(true);
    expect(getSpy).not.toHaveBeenCalled();

    // The stored blob must be openable by unlockWithBiometric with the same PRF output.
    vi.mocked(browser.storage.local.get).mockResolvedValue(storedBlob);
    vi.spyOn(navigator.credentials, "get").mockResolvedValue(
      makeAssertionCredential(prfOutput)
    );
    const unlock = await unlockWithBiometric();
    expect(unlock.isOk()).toBe(true);
    if (unlock.isOk()) expect(unlock.value).toBe("masterA");
  });

  test("when create() returns prf.enabled=true but no results, credentials.get IS called once", async () => {
    const prfOutput = makePrfOutput(0x55);
    let storedBlob: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      storedBlob = obj as Record<string, unknown>;
    });

    // create() signals support but defers the actual PRF output.
    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfEnabled: true, getTransports: () => ["internal"] })
    );
    // get() provides the deferred PRF output.
    vi.spyOn(navigator.credentials, "get")
      .mockResolvedValueOnce(makeAssertionCredential(prfOutput));

    const result = await enrollBiometric("masterB");
    expect(result.isOk()).toBe(true);
    // credentials.get was called exactly once (the deferred PRF fetch).
    expect(vi.mocked(navigator.credentials.get)).toHaveBeenCalledTimes(1);

    // The stored blob must be openable with that same PRF output.
    vi.mocked(browser.storage.local.get).mockResolvedValue(storedBlob);
    vi.spyOn(navigator.credentials, "get").mockResolvedValue(
      makeAssertionCredential(prfOutput)
    );
    const unlock = await unlockWithBiometric();
    expect(unlock.isOk()).toBe(true);
    if (unlock.isOk()) expect(unlock.value).toBe("masterB");
  });
});

// ── crypto/biometric-transports-fallback [HIGH] ───────────────────────────────

describe("enrollBiometric — transports persistence", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('when attestation has no getTransports, stored transports equals ["internal"]', async () => {
    const prfOutput = makePrfOutput(0x66);
    let storedBlob: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      storedBlob = obj as Record<string, unknown>;
    });

    // No getTransports on the attestation response.
    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfOutput })
    );

    const result = await enrollBiometric("master1");
    expect(result.isOk()).toBe(true);

    const stored = storedBlob[BIOMETRIC_STORAGE_KEY] as { transports: string[] };
    expect(stored.transports).toEqual(["internal"]);
  });

  test("when attestation returns getTransports, stored transports matches the returned array", async () => {
    const prfOutput = makePrfOutput(0x77);
    let storedBlob: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      storedBlob = obj as Record<string, unknown>;
    });

    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfOutput, getTransports: () => ["hybrid", "internal"] })
    );

    const result = await enrollBiometric("master2");
    expect(result.isOk()).toBe(true);

    const stored = storedBlob[BIOMETRIC_STORAGE_KEY] as { transports: string[] };
    expect(stored.transports).toEqual(["hybrid", "internal"]);
  });
});

// ── crypto/biometric-storage-set-rejects [HIGH] ───────────────────────────────

describe("enrollBiometric — storage.local.set rejects", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns Err when storage.local.set rejects after a successful WebAuthn ceremony", async () => {
    const prfOutput = makePrfOutput(0x88);
    vi.mocked(browser.storage.local.set).mockRejectedValue(new Error("quota exceeded"));

    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfOutput, getTransports: () => ["internal"] })
    );

    const result = await enrollBiometric("master3");
    expect(result.isErr()).toBe(true);
  });
});

// ── crypto/biometric-unlock-wrong-prf [MEDIUM] ───────────────────────────────

describe("unlockWithBiometric — wrong or corrupted PRF", () => {
  beforeEach(() => {
    installCredentialsStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Enroll with prfOutput A, then attempt unlock with prfOutput B. */
  async function enrollThenUnlockWith(
    enrollPrf: ArrayBuffer,
    unlockPrf: ArrayBuffer
  ) {
    let storedBlob: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      storedBlob = obj as Record<string, unknown>;
    });

    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfOutput: enrollPrf, getTransports: () => ["internal"] })
    );
    const enrollResult = await enrollBiometric("secretXYZ");
    expect(enrollResult.isOk()).toBe(true);

    vi.mocked(browser.storage.local.get).mockResolvedValue(storedBlob);
    vi.spyOn(navigator.credentials, "get").mockResolvedValue(
      makeAssertionCredential(unlockPrf)
    );
    return unlockWithBiometric();
  }

  test("unlock with a different PRF output returns Err (crypto_error)", async () => {
    const result = await enrollThenUnlockWith(makePrfOutput(0xaa), makePrfOutput(0xbb));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("crypto_error");
  });

  test("flipping a byte of stored wrappedMasterB64 returns Err (crypto_error)", async () => {
    const prfOutput = makePrfOutput(0xcc);
    let storedBlob: Record<string, unknown> = {};
    vi.mocked(browser.storage.local.set).mockImplementation(async (obj) => {
      storedBlob = obj as Record<string, unknown>;
    });

    vi.spyOn(navigator.credentials, "create").mockResolvedValue(
      makeCreateCredential({ prfOutput, getTransports: () => ["internal"] })
    );
    await enrollBiometric("secretABC");

    // Corrupt the wrappedMasterB64 in the stored blob.
    const stored = storedBlob[BIOMETRIC_STORAGE_KEY] as { wrappedMasterB64: string };
    const binary = atob(stored.wrappedMasterB64);
    const bytes = Uint8Array.from({ length: binary.length }, (_, i) => binary.charCodeAt(i));
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    let corrupted = "";
    for (let i = 0; i < bytes.length; i++) corrupted += String.fromCharCode(bytes[i]!);
    const corruptedB64 = btoa(corrupted);

    const corruptedBlob = {
      [BIOMETRIC_STORAGE_KEY]: { ...stored, wrappedMasterB64: corruptedB64 },
    };
    vi.mocked(browser.storage.local.get).mockResolvedValue(corruptedBlob);
    vi.spyOn(navigator.credentials, "get").mockResolvedValue(makeAssertionCredential(prfOutput));

    const result = await unlockWithBiometric();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("crypto_error");
  });
});
