import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { err, ok } from "neverthrow";

vi.mock("webextension-polyfill", () => ({
  default: {
    action: {
      onClicked: { addListener: vi.fn() },
    },
    sidePanel: {
      setPanelBehavior: vi.fn(),
    },
    sidebarAction: {
      open: vi.fn(),
    },
    runtime: {
      id: "test-ext-id",
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
    },
    storage: {
      session: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
      local: {
        get: vi.fn(),
      },
    },
    cookies: {
      getAll: vi.fn(),
      remove: vi.fn(),
    },
    tabs: {
      create: vi.fn(),
      query: vi.fn(),
      sendMessage: vi.fn(),
      update: vi.fn(),
      onRemoved: { addListener: vi.fn() },
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
import {
  BRIGHTSPACE_HOME_URL,
  CUNY_LOGIN_ENTRY_URL,
  OAA_RUI_LOGOUT_URL,
  PENDING_TOTP_SECRET_SESSION_KEY,
  SESSION_MASTER_KEY,
  SSO_LOGIN_HOST,
  SSO_LOGIN_ORIGIN,
  SSO_LOGIN_TABS_QUERY_URL_PATTERN,
} from "../cuny/ssoSite";
import type { OnboardingOverlayCommand } from "../onboarding/messages";
import { ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY } from "../onboarding/resumeSession";

// ──── shared fixtures ─────────────────────────────────────────────────────────

const MASTER = "correct-horse-battery-staple";

const PAYLOAD: VaultPayload = {
  email: "student@login.cuny.edu",
  password: "hunter2",
  totpSecret: "JBSWY3DPEHPK3PXP",
};

// ──── setup ───────────────────────────────────────────────────────────────────

type MessageHandler = (
  msg: unknown,
  sender: { id: string; url?: string; tab?: { id: number; url?: string } }
) => unknown;
const EXT_SENDER = { id: "test-ext-id" };
const CS_SENDER = {
  id: "test-ext-id",
  tab: { id: 99, url: `${SSO_LOGIN_ORIGIN}/fixture` },
};
let handler: MessageHandler;
let getStagedOverlayCommand: () => OnboardingOverlayCommand | null;

beforeAll(async () => {
  const module = await import("./service-worker");
  getStagedOverlayCommand = module.__test_getStagedOverlayCommand;
  handler = vi.mocked(browser.runtime.onMessage.addListener).mock
    .calls[0]![0]! as MessageHandler;
});

beforeEach(async () => {
  vi.resetAllMocks();
  vi.mocked(browser.storage.session!.get).mockResolvedValue({
    [SESSION_MASTER_KEY]: MASTER,
  });
  vi.mocked(browser.storage.local.get).mockResolvedValue({
    [VAULT_STORAGE_KEY]: {},
  });
  vi.mocked(isStoredVault).mockReturnValue(true);
  vi.mocked(decryptVault).mockResolvedValue(ok(PAYLOAD));
  const tabsApi = (browser as unknown as {
    tabs?: {
      create: ReturnType<typeof vi.fn>;
      query: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  }).tabs;
  if (tabsApi?.create) vi.mocked(tabsApi.create).mockResolvedValue({ id: 1 } as never);
  if (tabsApi?.query) vi.mocked(tabsApi.query).mockResolvedValue([]);
  if (tabsApi?.sendMessage) vi.mocked(tabsApi.sendMessage).mockResolvedValue(undefined);
  if (tabsApi?.update) vi.mocked(tabsApi.update).mockResolvedValue({} as never);
  vi.mocked(browser.cookies.getAll).mockResolvedValue([]);
  vi.mocked(browser.cookies.remove).mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER);
  await handler({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" }, EXT_SENDER);
});

// ──── message routing ─────────────────────────────────────────────────────────

describe("message routing", () => {
  test("enables side panel click behavior when API is available", async () => {
    vi.resetModules();
    const { default: reloadedBrowser } = await import("webextension-polyfill");
    await import("./service-worker");
    const sidePanelApi = (reloadedBrowser as unknown as {
      sidePanel?: { setPanelBehavior: ReturnType<typeof vi.fn> };
    }).sidePanel;
    await vi.waitFor(() => {
      expect(vi.mocked(sidePanelApi!.setPanelBehavior)).toHaveBeenCalledWith({
        openPanelOnActionClick: true,
      });
    });
  });

  test("registers toolbar click listener for sidebar_action.open", async () => {
    vi.resetModules();
    const { default: reloadedBrowser } = await import("webextension-polyfill");
    await import("./service-worker");
    const actionApi = (reloadedBrowser as unknown as {
      action?: { onClicked: { addListener: ReturnType<typeof vi.fn> } };
    }).action;
    expect(vi.mocked(actionApi!.onClicked.addListener)).toHaveBeenCalledTimes(1);
  });

  test("toolbar click listener opens sidebar action", async () => {
    vi.resetModules();
    const { default: reloadedBrowser } = await import("webextension-polyfill");
    await import("./service-worker");
    const actionApi = (reloadedBrowser as unknown as {
      action?: { onClicked: { addListener: ReturnType<typeof vi.fn> } };
    }).action;
    const sidebarActionApi = (reloadedBrowser as unknown as {
      sidebarAction?: { open: ReturnType<typeof vi.fn> };
    }).sidebarAction;

    const listener = vi.mocked(actionApi!.onClicked.addListener).mock.calls[0]?.[0];
    expect(listener).toBeTypeOf("function");
    listener?.();
    expect(vi.mocked(sidebarActionApi!.open)).toHaveBeenCalledTimes(1);
  });

  test("non-object message (string) → undefined", () => {
    expect(handler("hello", CS_SENDER)).toBeUndefined();
  });

  test("null message → undefined", () => {
    expect(handler(null, CS_SENDER)).toBeUndefined();
  });

  test("unknown type field → undefined", () => {
    expect(handler({ type: "UNKNOWN" }, CS_SENDER)).toBeUndefined();
  });

  test("missing type field → undefined", () => {
    expect(handler({}, CS_SENDER)).toBeUndefined();
  });
});

describe("privileged message sender rules", () => {
  test("STAGE_ONBOARDING_CREDENTIALS from a content script tab → { ok: false }", async () => {
    expect(
      await handler(
        {
          type: "STAGE_ONBOARDING_CREDENTIALS",
          email: "x@login.cuny.edu",
          password: "y",
        },
        CS_SENDER
      )
    ).toEqual({ ok: false });
  });

  test("TOTP_SECRET_FROM_PAGE without a trusted content tab → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" }, EXT_SENDER)
    ).toEqual({ ok: false });
  });

  test("TOTP_SECRET_FROM_PAGE with trusted URL but missing tab → { ok: false }", async () => {
    expect(
      await handler(
        { type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" },
        { id: "test-ext-id", url: `${SSO_LOGIN_ORIGIN}/oam` }
      )
    ).toEqual({ ok: false });
  });

  test("AUTO_FILL_REQUEST without sender.tab → invalid_sender", async () => {
    expect(
      await handler(
        { type: "AUTO_FILL_REQUEST" },
        { id: "test-ext-id", url: `${SSO_LOGIN_ORIGIN}/oam` }
      )
    ).toEqual({ success: false, reason: "invalid_sender" });
  });

  test("ONBOARDING_REOPEN_CUNY_TAB from a content script tab → { ok: false, invalid_payload }", async () => {
    expect(
      await handler({ type: "ONBOARDING_REOPEN_CUNY_TAB" }, CS_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
  });

  test("ONBOARDING_OVERLAY_COMMAND from a content script tab → { ok: false, invalid_payload }", async () => {
    expect(
      await handler({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" }, CS_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
  });

  test("STAGE_ONBOARDING_CREDENTIALS from extension tab frame URL → { ok: true }", async () => {
    expect(
      await handler(
        {
          type: "STAGE_ONBOARDING_CREDENTIALS",
          email: "tabbed@login.cuny.edu",
          password: "pw",
        },
        {
          id: "test-ext-id",
          tab: { id: 5, url: "chrome-extension://test-ext-id/sidebar.html" },
        }
      )
    ).toEqual({ ok: true });
    await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER);
  });
});

// ──── TOTP_SECRET_FROM_PAGE — input validation ────────────────────────────────

describe("TOTP_SECRET_FROM_PAGE — input validation", () => {
  test("missing secret field → { ok: false }", async () => {
    expect(await handler({ type: "TOTP_SECRET_FROM_PAGE" }, CS_SENDER)).toEqual({ ok: false });
  });

  test("empty string secret → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "" }, CS_SENDER)
    ).toEqual({ ok: false });
  });

  test("non-string secret (number) → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: 12345 }, CS_SENDER)
    ).toEqual({ ok: false });
  });

  test("9 chars after normalization (below minimum) → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHI" }, CS_SENDER)
    ).toEqual({ ok: false });
  });

  test("129 chars after normalization (above maximum) → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "A".repeat(129) }, CS_SENDER)
    ).toEqual({ ok: false });
  });

  test("invalid base32 char '1' → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGH1J" }, CS_SENDER)
    ).toEqual({ ok: false });
  });

  test("invalid base32 char '0' → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGH0J" }, CS_SENDER)
    ).toEqual({ ok: false });
  });

  test("invalid base32 char '8' → { ok: false }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGH8J" }, CS_SENDER)
    ).toEqual({ ok: false });
  });
});

// ──── TOTP_SECRET_FROM_PAGE — normalization ───────────────────────────────────

describe("TOTP_SECRET_FROM_PAGE — normalization", () => {
  test("already valid uppercase → { ok: true }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" }, CS_SENDER)
    ).toEqual({ ok: true });
  });

  test("lowercase → normalized to uppercase, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "abcdefghij" }, CS_SENDER)
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("surrounding spaces → stripped, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "  ABCDEFGHIJ  " }, CS_SENDER)
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("internal spaces → stripped, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDE FGHIJ" }, CS_SENDER)
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("trailing padding '=' → stripped, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ==" }, CS_SENDER)
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("lowercase + spaces + padding → all normalized, stored correctly", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "abcde fghij=" }, CS_SENDER)
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("exactly 10 chars after normalization (lower boundary) → { ok: true }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" }, CS_SENDER)
    ).toEqual({ ok: true });
  });

  test("exactly 128 chars after normalization (upper boundary) → { ok: true }", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "A".repeat(128) }, CS_SENDER)
    ).toEqual({ ok: true });
  });
});

// ──── TOTP_SECRET_FROM_PAGE — storage behavior ────────────────────────────────

describe("TOTP_SECRET_FROM_PAGE — storage behavior", () => {
  test("valid secret is stored under PENDING_TOTP_SECRET_SESSION_KEY", async () => {
    await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" }, CS_SENDER);
    expect(vi.mocked(browser.storage.session!.set)).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
  });

  test("storage.session.set throws → { ok: false }", async () => {
    vi.mocked(browser.storage.session!.set).mockRejectedValueOnce(
      new Error("storage full")
    );
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" }, CS_SENDER)
    ).toEqual({ ok: false });
  });

  test("invalid secret → storage.session.set never called", async () => {
    await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHI" }, CS_SENDER); // 9 chars
    expect(vi.mocked(browser.storage.session!.set)).not.toHaveBeenCalled();
  });
});

// ──── AUTO_FILL_REQUEST — failure paths ──────────────────────────────────────

describe("AUTO_FILL_REQUEST — failure paths", () => {
  test("session.get returns empty object → no_session_master", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({});
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: false,
      reason: "no_session_master",
    });
  });

  test("session master is a number, not a string → no_session_master", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [SESSION_MASTER_KEY]: 42,
    });
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: false,
      reason: "no_session_master",
    });
  });

  test("session.get throws → storage_error", async () => {
    vi.mocked(browser.storage.session!.get).mockRejectedValueOnce(
      new Error("session unavailable")
    );
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: false,
      reason: "storage_error",
    });
  });

  test("isStoredVault returns false → no_vault", async () => {
    vi.mocked(isStoredVault).mockReturnValue(false);
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: false,
      reason: "no_vault",
    });
  });

  test("local.get throws → storage_error", async () => {
    vi.mocked(browser.storage.local.get).mockRejectedValueOnce(
      new Error("storage error")
    );
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: false,
      reason: "storage_error",
    });
  });

  test("decryptVault returns decrypt_failed → decrypt_error", async () => {
    vi.mocked(decryptVault).mockResolvedValue(err("decrypt_failed"));
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: false,
      reason: "decrypt_error",
    });
  });

  test("decryptVault returns invalid_payload → decrypt_error", async () => {
    vi.mocked(decryptVault).mockResolvedValue(err("invalid_payload"));
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: false,
      reason: "decrypt_error",
    });
  });
});

// ──── AUTO_FILL_REQUEST — success path ───────────────────────────────────────

describe("AUTO_FILL_REQUEST — success path", () => {
  test("full happy path → { success: true, payload }", async () => {
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
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
    const result = (await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)) as {
      success: true;
      payload: VaultPayload;
    };
    expect(result.payload).toEqual(custom);
  });
});

// ──── ONBOARDING_* — valid payload acceptance ────────────────────────────────

describe("ONBOARDING_* — valid payload acceptance", () => {
  test("ONBOARDING_STAGE_DETECTED with known stage → { ok: true }", async () => {
    expect(
      await handler({ type: "ONBOARDING_STAGE_DETECTED", stage: "allow_gate" }, CS_SENDER)
    ).toEqual({ ok: true });
  });

  test("ONBOARDING_CREDENTIAL_ERROR with culprit=password → { ok: true }", async () => {
    expect(
      await handler({ type: "ONBOARDING_CREDENTIAL_ERROR", culprit: "password" }, CS_SENDER)
    ).toEqual({ ok: true });
  });

  test("ONBOARDING_OVERLAY_COMMAND with full payload → { ok: true }", async () => {
    expect(
      await handler({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        target: "#allow-btn",
        tooltipText: "Click Allow to continue.",
        stepIndex: 0,
        stepTotal: 4,
      }, EXT_SENDER)
    ).toEqual({ ok: true });
  });

  test("ONBOARDING_VERIFY_STATUS=success → { ok: true }", async () => {
    expect(
      await handler({ type: "ONBOARDING_VERIFY_STATUS", status: "success" }, CS_SENDER)
    ).toEqual({ ok: true });
  });

  test("ONBOARDING_REOPEN_CUNY_TAB without url → { ok: true }", async () => {
    expect(await handler({ type: "ONBOARDING_REOPEN_CUNY_TAB" }, EXT_SENDER)).toEqual({
      ok: true,
    });
  });

  test("ONBOARDING_TAB_REATTACHED with integer tabId → { ok: true }", async () => {
    expect(
      await handler({ type: "ONBOARDING_TAB_REATTACHED", tabId: 7 }, CS_SENDER)
    ).toEqual({ ok: true });
  });

  test("ONBOARDING_CUNY_TAB_MISSING with boolean payload → { ok: true }", async () => {
    expect(
      await handler({ type: "ONBOARDING_CUNY_TAB_MISSING", missing: true }, CS_SENDER)
    ).toEqual({ ok: true });
  });
});

describe("ONBOARDING_CONTENT_SCRIPT_READY", () => {
  test("returns null overlay command when no command staged", async () => {
    await handler({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "hide",
    }, EXT_SENDER);
    expect(await handler({ type: "ONBOARDING_CONTENT_SCRIPT_READY" }, CS_SENDER)).toEqual({
      overlayCommand: null,
    });
  });

  test("returns staged overlay command after show action", async () => {
    await handler({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "show",
      target: "#allow-btn",
      tooltipText: "Click Allow to continue.",
      stepIndex: 1,
      stepTotal: 4,
    }, EXT_SENDER);
    expect(await handler({ type: "ONBOARDING_CONTENT_SCRIPT_READY" }, CS_SENDER)).toEqual({
      overlayCommand: {
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        target: "#allow-btn",
        tooltipText: "Click Allow to continue.",
        stepIndex: 1,
        stepTotal: 4,
      },
    });
  });
});

// ──── ONBOARDING_* — invalid payload rejection ───────────────────────────────

describe("ONBOARDING_* — invalid payload rejection", () => {
  test("ONBOARDING_STAGE_DETECTED with unknown stage → { ok: false, invalid_payload }", async () => {
    expect(
      await handler({ type: "ONBOARDING_STAGE_DETECTED", stage: "nowhere" }, CS_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
  });

  test("ONBOARDING_STAGE_DETECTED with missing stage → { ok: false, invalid_payload }", async () => {
    expect(await handler({ type: "ONBOARDING_STAGE_DETECTED" }, CS_SENDER)).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
  });

  test("ONBOARDING_CREDENTIAL_ERROR with unknown culprit → { ok: false, invalid_payload }", async () => {
    expect(
      await handler({ type: "ONBOARDING_CREDENTIAL_ERROR", culprit: "pin" }, CS_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
  });

  test("ONBOARDING_OVERLAY_COMMAND with invalid action → { ok: false, invalid_payload }", async () => {
    expect(
      await handler({ type: "ONBOARDING_OVERLAY_COMMAND", action: "flash" }, EXT_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
  });

  test("ONBOARDING_OVERLAY_COMMAND with non-string target → { ok: false, invalid_payload }", async () => {
    expect(
      await handler({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        target: 42,
      }, EXT_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
  });

  test("ONBOARDING_VERIFY_STATUS with unknown status → { ok: false, invalid_payload }", async () => {
    expect(
      await handler({ type: "ONBOARDING_VERIFY_STATUS", status: "maybe" }, CS_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
  });

  test("ONBOARDING_TAB_REATTACHED with missing tabId → { ok: false, invalid_payload }", async () => {
    expect(await handler({ type: "ONBOARDING_TAB_REATTACHED" }, CS_SENDER)).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
  });

  test("ONBOARDING_CUNY_TAB_MISSING with non-boolean missing → { ok: false, invalid_payload }", async () => {
    expect(
      await handler({ type: "ONBOARDING_CUNY_TAB_MISSING", missing: "yes" }, CS_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
  });

  test("ONBOARDING_REOPEN_CUNY_TAB with non-string url → { ok: false, invalid_payload }", async () => {
    expect(
      await handler({ type: "ONBOARDING_REOPEN_CUNY_TAB", url: 123 }, EXT_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
  });
});

// ──── ONBOARDING_* — storage isolation (security invariant) ──────────────────

describe("ONBOARDING_* — never touches storage", () => {
  test("invalid onboarding payload does not write to storage.session", async () => {
    await handler({ type: "ONBOARDING_STAGE_DETECTED", stage: "nowhere" }, CS_SENDER);
    expect(vi.mocked(browser.storage.session!.set)).not.toHaveBeenCalled();
  });

  test("valid onboarding message does not read or write vault storage", async () => {
    await handler({ type: "ONBOARDING_OVERLAY_COMMAND", action: "show" }, EXT_SENDER);
    expect(vi.mocked(browser.storage.local.get)).not.toHaveBeenCalled();
    expect(vi.mocked(browser.storage.session!.set)).not.toHaveBeenCalled();
  });
});

describe("ONBOARDING_OVERLAY_COMMAND staging semantics", () => {
  test("show action stages command", async () => {
    await handler({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "show",
      target: "#allow-btn",
    }, EXT_SENDER);
    expect(getStagedOverlayCommand()).toEqual({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "show",
      target: "#allow-btn",
    });
  });

  test("hide action clears staged command", async () => {
    await handler({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "show",
      target: "#allow-btn",
    }, EXT_SENDER);
    await handler({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "hide",
    }, EXT_SENDER);
    expect(getStagedOverlayCommand()).toBeNull();
  });

  test("invalid overlay payload does not change staged command", async () => {
    await handler({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "show",
      target: "#allow-btn",
    }, EXT_SENDER);
    const before = getStagedOverlayCommand();
    await handler({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "show",
      target: 42,
    }, EXT_SENDER);
    expect(getStagedOverlayCommand()).toEqual(before);
  });
});

// ──── default-reject behavior for unknown ONBOARDING_-prefixed types ─────────

describe("unknown type rejection", () => {
  test("ONBOARDING_ prefix with unregistered type → undefined (unrouted)", () => {
    // An unregistered ONBOARDING_-prefixed type is treated like any unknown
    // message: the router does not invent a response for it. The service
    // worker falls through to `undefined`, preserving the default-reject
    // contract established by `type === "UNKNOWN"`.
    expect(handler({ type: "ONBOARDING_NOT_A_REAL_TYPE" }, CS_SENDER)).toBeUndefined();
  });

  test("totally unknown top-level type → undefined", () => {
    expect(handler({ type: "UNRELATED_MESSAGE" }, CS_SENDER)).toBeUndefined();
  });

  test("onboarding routing does not intercept AUTO_FILL_REQUEST", async () => {
    // Regression guard: the onboarding branch must not swallow the core
    // `AUTO_FILL_REQUEST` path. With the default happy-path fixtures, the
    // handler should still return a success response.
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: true,
      payload: PAYLOAD,
    });
  });

  test("onboarding routing does not intercept TOTP_SECRET_FROM_PAGE", async () => {
    expect(
      await handler({ type: "TOTP_SECRET_FROM_PAGE", secret: "ABCDEFGHIJ" }, CS_SENDER)
    ).toEqual({ ok: true });
  });
});

// ──── onboarding credential staging ──────────────────────────────────────────

describe("STAGE_ONBOARDING_CREDENTIALS", () => {
  test("valid payload → { ok: true }", async () => {
    expect(
      await handler({
        type: "STAGE_ONBOARDING_CREDENTIALS",
        email: "student@login.cuny.edu",
        password: "hunter2",
      }, EXT_SENDER)
    ).toEqual({ ok: true });
    // Behavior: the staged payload becomes the fallback when the vault is not
    // set up yet. Asserted in the AUTO_FILL_REQUEST fallback suite below.
    await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER);
  });

  test("missing email → { ok: false } and nothing is staged", async () => {
    expect(
      await handler({
        type: "STAGE_ONBOARDING_CREDENTIALS",
        password: "hunter2",
      }, EXT_SENDER)
    ).toEqual({ ok: false });
    // Verify via AUTO_FILL: with no vault and no staged creds, we get
    // no_session_master (session master fixture exists) → no_vault path.
    vi.mocked(isStoredVault).mockReturnValue(false);
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: false,
      reason: "no_vault",
    });
  });

  test("missing password → { ok: false }", async () => {
    expect(
      await handler({
        type: "STAGE_ONBOARDING_CREDENTIALS",
        email: "a@login.cuny.edu",
      }, EXT_SENDER)
    ).toEqual({ ok: false });
  });

  test("CLEAR_ONBOARDING_CREDENTIALS is idempotent and acks { ok: true }", async () => {
    expect(
      await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER)
    ).toEqual({ ok: true });
    expect(
      await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER)
    ).toEqual({ ok: true });
  });
});

describe("PERSIST_ONBOARDING_RESUME_SNAPSHOT", () => {
  test("from extension UI persists snapshot", async () => {
    vi.mocked(browser.storage.session!.set).mockResolvedValue(undefined);
    expect(
      await handler(
        {
          type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
          state: "VERIFY_LOGIN_CODE",
          email: "a@login.cuny.edu",
          password: "pw",
        },
        EXT_SENDER
      )
    ).toEqual({ ok: true });
    expect(browser.storage.session!.set).toHaveBeenCalledWith({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "VERIFY_LOGIN_CODE",
        email: "a@login.cuny.edu",
        password: "pw",
      },
    });
  });

  test("clears session for non-resumable state", async () => {
    vi.mocked(browser.storage.session!.remove).mockResolvedValue(undefined);
    expect(
      await handler(
        {
          type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
          state: "EXT_PASSWORD_SETUP",
          email: "a@login.cuny.edu",
          password: "pw",
        },
        EXT_SENDER
      )
    ).toEqual({ ok: true });
    expect(browser.storage.session!.remove).toHaveBeenCalled();
  });

  test("from content script → { ok: false }", async () => {
    expect(
      await handler(
        {
          type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
          state: "ALLOW_GATE",
          email: "a@login.cuny.edu",
          password: "pw",
        },
        CS_SENDER
      )
    ).toEqual({ ok: false });
  });
});

// ──── AUTO_FILL_REQUEST fallback to staged onboarding creds ─────────────────

// eslint-disable-next-line max-lines-per-function
describe("AUTO_FILL_REQUEST onboarding fallback", () => {
  test("no vault + staged onboarding credentials + pending secret + enroll_verify context → returns pending totpSecret", async () => {
    // Vault is absent (onboarding is pre-vault).
    vi.mocked(isStoredVault).mockReturnValue(false);
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
    await handler({
      type: "STAGE_ONBOARDING_CREDENTIALS",
      email: "onboard@login.cuny.edu",
      password: "pending",
    }, EXT_SENDER);
    expect(
      await handler({ type: "AUTO_FILL_REQUEST", otpContext: "enroll_verify" }, CS_SENDER)
    ).toEqual({
      success: true,
      payload: {
        email: "onboard@login.cuny.edu",
        password: "pending",
        totpSecret: "ABCDEFGHIJ",
      },
    });
    // Clean up shared module-level state so later tests don't see stale creds.
    await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER);
  });

  test("no vault + staged onboarding credentials + pending secret + login_totp context → returns empty totpSecret", async () => {
    vi.mocked(isStoredVault).mockReturnValue(false);
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "ABCDEFGHIJ",
    });
    await handler({
      type: "STAGE_ONBOARDING_CREDENTIALS",
      email: "onboard@login.cuny.edu",
      password: "pending",
    }, EXT_SENDER);
    expect(
      await handler({ type: "AUTO_FILL_REQUEST", otpContext: "login_totp" }, CS_SENDER)
    ).toEqual({
      success: true,
      payload: {
        email: "onboard@login.cuny.edu",
        password: "pending",
        totpSecret: "",
      },
    });
    await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER);
  });

  test("no vault + staged onboarding credentials + no pending secret → returns empty totpSecret", async () => {
    vi.mocked(isStoredVault).mockReturnValue(false);
    vi.mocked(browser.storage.session!.get).mockResolvedValue({});
    await handler({
      type: "STAGE_ONBOARDING_CREDENTIALS",
      email: "onboard@login.cuny.edu",
      password: "pending",
    }, EXT_SENDER);
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: true,
      payload: {
        email: "onboard@login.cuny.edu",
        password: "pending",
        totpSecret: "",
      },
    });
    await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER);
  });

  test("vault present + staged onboarding credentials → vault wins (security invariant)", async () => {
    await handler({
      type: "STAGE_ONBOARDING_CREDENTIALS",
      email: "onboard@login.cuny.edu",
      password: "pending",
    }, EXT_SENDER);
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: true,
      payload: PAYLOAD,
    });
    await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER);
  });

  test("vault present + active onboarding + pending secret + enroll_verify → totpSecret overridden with pending", async () => {
    // Active mid-enrollment with an existing vault: the stale vault TOTP
    // would produce wrong codes on the new factor's verify page. The fresh
    // session-staged secret must win for `otp|input` specifically. We gate
    // on stagedOnboardingCredentials so viewing an already-enrolled factor
    // (no active onboarding) still uses the vault's authoritative secret.
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [SESSION_MASTER_KEY]: MASTER,
      [PENDING_TOTP_SECRET_SESSION_KEY]: "FRESHENROLLSECRET",
    });
    await handler({
      type: "STAGE_ONBOARDING_CREDENTIALS",
      email: "onboard@login.cuny.edu",
      password: "pending",
    }, EXT_SENDER);
    expect(
      await handler({ type: "AUTO_FILL_REQUEST", otpContext: "enroll_verify" }, CS_SENDER)
    ).toEqual({
      success: true,
      payload: {
        email: PAYLOAD.email,
        password: PAYLOAD.password,
        totpSecret: "FRESHENROLLSECRET",
      },
    });
    await handler({ type: "CLEAR_ONBOARDING_CREDENTIALS" }, EXT_SENDER);
  });

  test("vault present + NO active onboarding + pending secret + enroll_verify → vault totpSecret retained", async () => {
    // User is viewing their own enrolled factor's self-service page: page
    // scrapes the secret (equal to vault's on real CUNY), but no onboarding
    // is in flight, so the vault is authoritative. Override must NOT fire.
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [SESSION_MASTER_KEY]: MASTER,
      [PENDING_TOTP_SECRET_SESSION_KEY]: "SCRAPEDSECRET",
    });
    expect(
      await handler({ type: "AUTO_FILL_REQUEST", otpContext: "enroll_verify" }, CS_SENDER)
    ).toEqual({
      success: true,
      payload: PAYLOAD,
    });
  });

  test("vault present + pending secret + login_totp context → vault totpSecret retained (no override)", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [SESSION_MASTER_KEY]: MASTER,
      [PENDING_TOTP_SECRET_SESSION_KEY]: "FRESHENROLLSECRET",
    });
    expect(
      await handler({ type: "AUTO_FILL_REQUEST", otpContext: "login_totp" }, CS_SENDER)
    ).toEqual({
      success: true,
      payload: PAYLOAD,
    });
  });

  test("vault present + pending secret + no otpContext → vault totpSecret retained (no override)", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [SESSION_MASTER_KEY]: MASTER,
      [PENDING_TOTP_SECRET_SESSION_KEY]: "FRESHENROLLSECRET",
    });
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: true,
      payload: PAYLOAD,
    });
  });

  test("no vault, no staged credentials, no session master → no_session_master", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({});
    vi.mocked(isStoredVault).mockReturnValue(false);
    expect(await handler({ type: "AUTO_FILL_REQUEST" }, CS_SENDER)).toEqual({
      success: false,
      reason: "no_session_master",
    });
  });
});

// ──── ONBOARDING_REOPEN_CUNY_TAB tab creation ────────────────────────────────

describe("ONBOARDING_REOPEN_CUNY_TAB", () => {
  test("with Brightspace url → clears D2L session cookies before opening tab", async () => {
    const url = BRIGHTSPACE_HOME_URL;
    expect(
      await handler({ type: "ONBOARDING_REOPEN_CUNY_TAB", url }, EXT_SENDER)
    ).toEqual({ ok: true });
    expect(vi.mocked(browser.cookies.remove)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(browser.cookies.remove)).toHaveBeenNthCalledWith(1, {
      name: "d2lSessionVal",
      url: BRIGHTSPACE_HOME_URL,
    });
    expect(vi.mocked(browser.cookies.remove)).toHaveBeenNthCalledWith(2, {
      name: "d2lSecureSessionVal",
      url: BRIGHTSPACE_HOME_URL,
    });
  });

  test("with disallowed https url → { ok: false, invalid_payload } and no tab", async () => {
    const url = "https://example.test/cuny-fixture";
    const tabsApi = (browser as unknown as {
      tabs: { create: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
    }).tabs;
    expect(
      await handler({ type: "ONBOARDING_REOPEN_CUNY_TAB", url }, EXT_SENDER)
    ).toEqual({ ok: false, reason: "invalid_payload" });
    expect(vi.mocked(tabsApi.create)).not.toHaveBeenCalled();
  });

  test("with allowed ssologin url → terminates OAA session then opens tab", async () => {
    const url = `${SSO_LOGIN_ORIGIN}/oam/server/obrareq.cgi`;
    const tabsApi = (browser as unknown as {
      tabs: { create: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
    }).tabs;
    expect(
      await handler({ type: "ONBOARDING_REOPEN_CUNY_TAB", url }, EXT_SENDER)
    ).toEqual({ ok: true });
    expect(vi.mocked(tabsApi.query)).toHaveBeenCalledWith({
      url: [SSO_LOGIN_TABS_QUERY_URL_PATTERN],
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(OAA_RUI_LOGOUT_URL, { credentials: "include" });
    expect(vi.mocked(browser.cookies.getAll)).toHaveBeenCalledWith({ domain: SSO_LOGIN_HOST });
    expect(vi.mocked(browser.cookies.remove)).not.toHaveBeenCalled();
    expect(vi.mocked(tabsApi.create)).toHaveBeenCalledWith({ url, active: true });
  });

  test("without url → falls back to CUNY_LOGIN_ENTRY_URL", async () => {
    const tabsApi = (browser as unknown as {
      tabs: { create: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
    }).tabs;
    expect(
      await handler({ type: "ONBOARDING_REOPEN_CUNY_TAB" }, EXT_SENDER)
    ).toEqual({ ok: true });
    expect(vi.mocked(tabsApi.query)).toHaveBeenCalledWith({
      url: [SSO_LOGIN_TABS_QUERY_URL_PATTERN],
    });
    expect(vi.mocked(tabsApi.create)).toHaveBeenCalledWith({
      url: CUNY_LOGIN_ENTRY_URL,
      active: true,
    });
  });

  test("tabs.create throws → { ok: false, reason: 'forward_failed' }", async () => {
    const tabsApi = (browser as unknown as {
      tabs: { create: ReturnType<typeof vi.fn> };
    }).tabs;
    vi.mocked(tabsApi.create).mockRejectedValueOnce(new Error("perm denied"));
    expect(
      await handler({ type: "ONBOARDING_REOPEN_CUNY_TAB" }, EXT_SENDER)
    ).toEqual({ ok: false, reason: "forward_failed" });
  });

  test("fetch failure does not prevent tab from opening", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network error"));
    expect(
      await handler({ type: "ONBOARDING_REOPEN_CUNY_TAB" }, EXT_SENDER)
    ).toEqual({ ok: true });
  });
});

describe("LOGOUT_CUNY_SESSIONS", () => {
  test("navigates ssologin tabs to the OAA logout URL and fetches logout", async () => {
    const tabsApi = (browser as unknown as {
      tabs: {
        query: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
    }).tabs;
    vi.mocked(tabsApi.query).mockResolvedValueOnce([
      { id: 42, url: `${SSO_LOGIN_ORIGIN}/oaa/rui/index.html` },
    ]);
    expect(await handler({ type: "LOGOUT_CUNY_SESSIONS" }, EXT_SENDER)).toEqual({ ok: true });
    expect(vi.mocked(tabsApi.query)).toHaveBeenCalledWith({
      url: [SSO_LOGIN_TABS_QUERY_URL_PATTERN],
    });
    expect(vi.mocked(tabsApi.update)).toHaveBeenCalledWith(42, {
      url: OAA_RUI_LOGOUT_URL,
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(OAA_RUI_LOGOUT_URL, { credentials: "include" });
    expect(vi.mocked(browser.cookies.getAll)).toHaveBeenCalledWith({ domain: SSO_LOGIN_HOST });
  });

  test("removes every ssologin cookie after logout", async () => {
    vi.mocked(browser.cookies.getAll).mockResolvedValueOnce([
      {
        name: "OAM_ID",
        domain: SSO_LOGIN_HOST,
        path: "/",
        secure: true,
        storeId: "0",
      },
      {
        name: "oaaCtx",
        domain: `.${SSO_LOGIN_HOST}`,
        path: "/oaa/",
        secure: true,
        storeId: "0",
      },
    ] as never);
    expect(await handler({ type: "LOGOUT_CUNY_SESSIONS" }, EXT_SENDER)).toEqual({ ok: true });
    expect(vi.mocked(browser.cookies.remove)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(browser.cookies.remove)).toHaveBeenNthCalledWith(1, {
      name: "OAM_ID",
      url: `https://${SSO_LOGIN_HOST}/`,
      storeId: "0",
    });
    expect(vi.mocked(browser.cookies.remove)).toHaveBeenNthCalledWith(2, {
      name: "oaaCtx",
      url: `https://${SSO_LOGIN_HOST}/oaa/`,
      storeId: "0",
    });
  });

  test("returns ok:true even when no ssologin tabs are open (fetch still runs)", async () => {
    expect(await handler({ type: "LOGOUT_CUNY_SESSIONS" }, EXT_SENDER)).toEqual({ ok: true });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(OAA_RUI_LOGOUT_URL, { credentials: "include" });
  });

});
