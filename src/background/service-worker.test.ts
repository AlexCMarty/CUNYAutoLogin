import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { err, ok } from "neverthrow";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
    },
    storage: {
      session: {
        get: vi.fn(),
        set: vi.fn(),
      },
      local: {
        get: vi.fn(),
      },
    },
  },
}));

vi.mock("../crypto/vault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../crypto/vault")>();
  return {
    ...actual,
    decryptVault: vi.fn(),
    isStoredVault: vi.fn(),
  };
});

import browser from "webextension-polyfill";
import { decryptVault, isStoredVault, VAULT_STORAGE_KEY } from "../crypto/vault";
import type { VaultPayload } from "../crypto/vault";
import { PENDING_TOTP_SECRET_SESSION_KEY, SESSION_MASTER_KEY } from "../cuny/ssoSite";

// ──── shared fixtures ─────────────────────────────────────────────────────────

const MASTER = "correct-horse-battery-staple";

const PAYLOAD: VaultPayload = {
  email: "student@login.cuny.edu",
  password: "hunter2",
  totpSecret: "JBSWY3DPEHPK3PXP",
};

// ──── setup ───────────────────────────────────────────────────────────────────

type MessageHandler = (msg: unknown) => unknown;
let handler: MessageHandler;

beforeAll(async () => {
  await import("./service-worker");
  handler = vi.mocked(browser.runtime.onMessage.addListener).mock
    .calls[0]![0]! as MessageHandler;
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(browser.storage.session!.get).mockResolvedValue({
    [SESSION_MASTER_KEY]: MASTER,
  });
  vi.mocked(browser.storage.local.get).mockResolvedValue({
    [VAULT_STORAGE_KEY]: {},
  });
  vi.mocked(isStoredVault).mockReturnValue(true);
  vi.mocked(decryptVault).mockResolvedValue(ok(PAYLOAD));
});

// ──── message routing ─────────────────────────────────────────────────────────

describe("message routing", () => {
  test("non-object message (string) → undefined", () => {
    expect(handler("hello")).toBeUndefined();
  });

  test("null message → undefined", () => {
    expect(handler(null)).toBeUndefined();
  });

  test("unknown type field → undefined", () => {
    expect(handler({ type: "UNKNOWN" })).toBeUndefined();
  });

  test("missing type field → undefined", () => {
    expect(handler({})).toBeUndefined();
  });
});

// ──── TOTP_SECRET_FROM_PAGE — input validation ────────────────────────────────

describe("TOTP_SECRET_FROM_PAGE — input validation", () => {
  test("missing secret field → { ok: false }", async () => {
    expect(await handler({ type: "TOTP_SECRET_FROM_PAGE" })).toEqual({ ok: false });
  });

  test("empty string secret → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "" })
    ).toEqual({ ok: false });
  });

  test("non-string secret (number) → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: 12345 })
    ).toEqual({ ok: false });
  });

  test("9 chars after normalization (below minimum) → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHI" })
    ).toEqual({ ok: false });
  });

  test("129 chars after normalization (above maximum) → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "A".repeat(129) })
    ).toEqual({ ok: false });
  });

  test("invalid base32 char '1' → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGH1J" })
    ).toEqual({ ok: false });
  });

  test("invalid base32 char '0' → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGH0J" })
    ).toEqual({ ok: false });
  });

  test("invalid base32 char '8' → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGH8J" })
    ).toEqual({ ok: false });
  });
});

// ──── TOTP_SECRET_FROM_PAGE — normalization ───────────────────────────────────

describe("TOTP_SECRET_FROM_PAGE — normalization", () => {
  test("already valid uppercase → { ok: true }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" })
    ).toEqual({ ok: true });
  });

  test("lowercase → normalized to uppercase, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "abcdefghij" })
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("surrounding spaces → stripped, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "  ABCDEFGHIJ  " })
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("internal spaces → stripped, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDE FGHIJ" })
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("trailing padding '=' → stripped, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ==" })
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("lowercase + spaces + padding → all normalized, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "abcde fghij=" })
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("exactly 10 chars after normalization (lower boundary) → { ok: true }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" })
    ).toEqual({ ok: true });
  });

  test("exactly 128 chars after normalization (upper boundary) → { ok: true }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "A".repeat(128) })
    ).toEqual({ ok: true });
  });
});

// ──── TOTP_SECRET_FROM_PAGE — storage behavior ────────────────────────────────

describe("TOTP_SECRET_FROM_PAGE — storage behavior", () => {
  test("valid secret is stored under PENDING_TOTP_SECRET_SESSION_KEY", async () => {
    await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("storage.session.set throws → { ok: false }", async () => {
    vi.mocked(browser.storage.session!.set).mockRejectedValueOnce(
      new Error("storage full")
    );
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" })
    ).toEqual({ ok: false });
  });

  test("invalid secret → storage.session.set never called", async () => {
    await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHI" }); // 9 chars
    expect(vi.mocked(browser.storage.session!.set)).not.toHaveBeenCalled();
  });
});

// ──── AUTO_FILL_REQUEST — failure paths ──────────────────────────────────────

describe("AUTO_FILL_REQUEST — failure paths", () => {
  test("session.get returns empty object → no_session_master", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({});
    expect(await handler({ type: "AUTO_FILL_REQUEST" })).toEqual({
      success: false,
      reason: "no_session_master",
    });
  });

  test("session master is a number, not a string → no_session_master", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [SESSION_MASTER_KEY]: 42,
    });
    expect(await handler({ type: "AUTO_FILL_REQUEST" })).toEqual({
      success: false,
      reason: "no_session_master",
    });
  });

  test("session.get throws → decrypt_error", async () => {
    vi.mocked(browser.storage.session!.get).mockRejectedValueOnce(
      new Error("session unavailable")
    );
    expect(await handler({ type: "AUTO_FILL_REQUEST" })).toEqual({
      success: false,
      reason: "decrypt_error",
    });
  });

  test("isStoredVault returns false → no_vault", async () => {
    vi.mocked(isStoredVault).mockReturnValue(false);
    expect(await handler({ type: "AUTO_FILL_REQUEST" })).toEqual({
      success: false,
      reason: "no_vault",
    });
  });

  test("local.get throws → decrypt_error", async () => {
    vi.mocked(browser.storage.local.get).mockRejectedValueOnce(
      new Error("storage error")
    );
    expect(await handler({ type: "AUTO_FILL_REQUEST" })).toEqual({
      success: false,
      reason: "decrypt_error",
    });
  });

  test("decryptVault returns decrypt_failed → decrypt_error", async () => {
    vi.mocked(decryptVault).mockResolvedValue(err("decrypt_failed"));
    expect(await handler({ type: "AUTO_FILL_REQUEST" })).toEqual({
      success: false,
      reason: "decrypt_error",
    });
  });

  test("decryptVault returns invalid_payload → decrypt_error", async () => {
    vi.mocked(decryptVault).mockResolvedValue(err("invalid_payload"));
    expect(await handler({ type: "AUTO_FILL_REQUEST" })).toEqual({
      success: false,
      reason: "decrypt_error",
    });
  });
});

// ──── AUTO_FILL_REQUEST — success path ───────────────────────────────────────

describe("AUTO_FILL_REQUEST — success path", () => {
  test("full happy path → { success: true, payload }", async () => {
    expect(await handler({ type: "AUTO_FILL_REQUEST" })).toEqual({
      success: true,
      payload: PAYLOAD,
    });
  });

  test("payload fields passed through unchanged", async () => {
    const custom: VaultPayload = {
      email: "other@login.cuny.edu",
      password: "s3cr3t!",
      totpSecret: "ZYXWVUTSRQ",
    };
    vi.mocked(decryptVault).mockResolvedValue(ok(custom));
    const result = (await handler({ type: "AUTO_FILL_REQUEST" })) as {
      success: true;
      payload: VaultPayload;
    };
    expect(result.payload).toEqual(custom);
  });
});
