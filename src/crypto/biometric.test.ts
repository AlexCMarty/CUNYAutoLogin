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

// jsdom does not implement navigator.credentials — install a stub so spyOn works.
function installCredentialsStub(): void {
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
      [BIOMETRIC_STORAGE_KEY]: {
        version: 1,
        credentialIdB64: "AAAA",
        transports: ["internal"],
        prfSaltB64: "BBBB",
        ivB64: "CCCC",
        wrappedMasterB64: "DDDD",
      },
    });
    vi.spyOn(navigator.credentials, "get").mockRejectedValue(
      new DOMException("User cancelled", "NotAllowedError")
    );
    const result = await unlockWithBiometric();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("user_cancelled");
  });
});
