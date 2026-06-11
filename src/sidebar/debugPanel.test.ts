// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from "vitest";
import browser from "webextension-polyfill";
import { mountDebugPanel, type DebugPanelDeps } from "./debugPanel";
import { SSO_LOGIN_HOST } from "../cuny/ssoSite";
import type { SidebarDom } from "./sidebar.utils";

vi.mock("webextension-polyfill", () => ({
  default: {
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
  },
}));

function makeSidebarDom(): SidebarDom {
  const form = document.createElement("form");
  const formWrapper = document.createElement("div");
  formWrapper.appendChild(form);
  document.body.appendChild(formWrapper);

  return {
    form,
    email: document.createElement("input") as HTMLInputElement,
    password: document.createElement("input") as HTMLInputElement,
    totpSecret: document.createElement("input") as HTMLInputElement,
    totpSecretSourceHint: document.createElement("div"),
    masterPassword: document.createElement("input") as HTMLInputElement,
    masterLabel: document.createElement("div"),
    newMasterPassword: document.createElement("input") as HTMLInputElement,
    confirmNewMasterPassword: document.createElement("input") as HTMLInputElement,
    submitBtn: document.createElement("button") as HTMLButtonElement,
    lockBtn: document.createElement("button") as HTMLButtonElement,
    modeHint: document.createElement("div"),
    credentialFields: document.createElement("div"),
    masterPasswordField: document.createElement("div"),
    changeMasterSection: document.createElement("div"),
    emailLabel: null,
    passwordLabel: null,
  };
}

function makeDeps(overrides: Partial<DebugPanelDeps> = {}): DebugPanelDeps {
  const els = makeSidebarDom();
  return {
    els,
    setStatus: vi.fn(),
    getSessionPayload: vi.fn().mockReturnValue(null),
    onClearVault: vi.fn(),
    onClearLiveSessions: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.resetAllMocks();
});

describe("mountDebugPanel — DOM structure", () => {
  test("appends a section with class dev-test and aria-label", () => {
    const deps = makeDeps();
    mountDebugPanel(deps);

    const section = deps.els.form.parentElement?.querySelector("section.dev-test");
    expect(section).toBeTruthy();
    expect(section?.getAttribute("aria-label")).toBe("Development test");
  });

  test("three buttons are mounted with expected ids", () => {
    const deps = makeDeps();
    mountDebugPanel(deps);

    expect(document.getElementById("test-message-btn")).toBeTruthy();
    expect(document.getElementById("clear-vault-debug-btn")).toBeTruthy();
    expect(document.getElementById("clear-live-sessions-debug-btn")).toBeTruthy();
  });
});

describe("test-message-btn — no session payload", () => {
  test("calls setStatus with vault-locked message when payload is null", () => {
    const deps = makeDeps({ getSessionPayload: vi.fn().mockReturnValue(null) });
    mountDebugPanel(deps);

    document.getElementById("test-message-btn")?.click();

    expect(deps.setStatus).toHaveBeenCalledWith("Vault is locked. Unlock it first.");
  });
});

describe("test-message-btn — tabs.query rejection", () => {
  test("calls setStatus with no-active-tab message when query rejects", async () => {
    const mockPayload = { email: "student@login.cuny.edu", password: "pw", totpSecret: "TOTP" };
    vi.spyOn(browser.tabs, "query").mockRejectedValueOnce(new Error("no permission"));

    const deps = makeDeps({ getSessionPayload: vi.fn().mockReturnValue(mockPayload) });
    mountDebugPanel(deps);

    document.getElementById("test-message-btn")?.click();

    await vi.waitFor(() => {
      expect(deps.setStatus).toHaveBeenCalledWith("No active tab.");
    });
  });
});

describe("test-message-btn — tab returned but no id", () => {
  test("calls setStatus with no-active-tab when first tab has no id", async () => {
    const mockPayload = { email: "student@login.cuny.edu", password: "pw", totpSecret: "TOTP" };
    vi.spyOn(browser.tabs, "query").mockResolvedValueOnce([{}] as browser.Tabs.Tab[]);

    const deps = makeDeps({ getSessionPayload: vi.fn().mockReturnValue(mockPayload) });
    mountDebugPanel(deps);

    document.getElementById("test-message-btn")?.click();

    await vi.waitFor(() => {
      expect(deps.setStatus).toHaveBeenCalledWith("No active tab.");
    });
  });

  test("calls setStatus with no-active-tab when tabs array is empty", async () => {
    const mockPayload = { email: "student@login.cuny.edu", password: "pw", totpSecret: "TOTP" };
    vi.spyOn(browser.tabs, "query").mockResolvedValueOnce([]);

    const deps = makeDeps({ getSessionPayload: vi.fn().mockReturnValue(mockPayload) });
    mountDebugPanel(deps);

    document.getElementById("test-message-btn")?.click();

    await vi.waitFor(() => {
      expect(deps.setStatus).toHaveBeenCalledWith("No active tab.");
    });
  });
});

describe("test-message-btn — happy path", () => {
  test("calls tabs.sendMessage with FILL_CREDENTIALS and payload", async () => {
    const mockPayload = { email: "student@login.cuny.edu", password: "pw", totpSecret: "TOTP" };
    vi.spyOn(browser.tabs, "query").mockResolvedValueOnce([{ id: 42 }] as browser.Tabs.Tab[]);
    vi.spyOn(browser.tabs, "sendMessage").mockResolvedValueOnce(undefined);

    const deps = makeDeps({ getSessionPayload: vi.fn().mockReturnValue(mockPayload) });
    mountDebugPanel(deps);

    document.getElementById("test-message-btn")?.click();

    await vi.waitFor(() => {
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(42, {
        type: "FILL_CREDENTIALS",
        payload: mockPayload,
      });
      expect(deps.setStatus).toHaveBeenCalledWith("Filling…", true);
    });
  });
});

describe("test-message-btn — sendMessage rejects", () => {
  test("calls setStatus mentioning the SSO host when sendMessage fails", async () => {
    const mockPayload = { email: "student@login.cuny.edu", password: "pw", totpSecret: "TOTP" };
    vi.spyOn(browser.tabs, "query").mockResolvedValueOnce([{ id: 7 }] as browser.Tabs.Tab[]);
    vi.spyOn(browser.tabs, "sendMessage").mockRejectedValueOnce(new Error("no content script"));

    const deps = makeDeps({ getSessionPayload: vi.fn().mockReturnValue(mockPayload) });
    mountDebugPanel(deps);

    document.getElementById("test-message-btn")?.click();

    await vi.waitFor(() => {
      const call = (deps.setStatus as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(typeof call?.[0]).toBe("string");
      expect((call?.[0] as string)).toContain(SSO_LOGIN_HOST);
    });
  });
});

describe("clear-vault-debug-btn", () => {
  test("does NOT call onClearVault when window.confirm returns false", () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);

    const deps = makeDeps();
    mountDebugPanel(deps);

    document.getElementById("clear-vault-debug-btn")?.click();

    expect(deps.onClearVault).not.toHaveBeenCalled();
  });

  test("calls onClearVault when window.confirm returns true", () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);

    const deps = makeDeps();
    mountDebugPanel(deps);

    document.getElementById("clear-vault-debug-btn")?.click();

    expect(deps.onClearVault).toHaveBeenCalledOnce();
  });
});

describe("clear-live-sessions-debug-btn", () => {
  test("setStatus says could not clear cookies when onClearLiveSessions returns false", async () => {
    const deps = makeDeps({ onClearLiveSessions: vi.fn().mockResolvedValue(false) });
    mountDebugPanel(deps);

    document.getElementById("clear-live-sessions-debug-btn")?.click();

    await vi.waitFor(() => {
      expect(deps.setStatus).toHaveBeenCalledWith("Could not clear CUNY session cookies.");
    });
  });

  test("setStatus reports cleared cookies when onClearLiveSessions returns true", async () => {
    const deps = makeDeps({ onClearLiveSessions: vi.fn().mockResolvedValue(true) });
    mountDebugPanel(deps);

    document.getElementById("clear-live-sessions-debug-btn")?.click();

    await vi.waitFor(() => {
      const call = (deps.setStatus as ReturnType<typeof vi.fn>).mock.calls[0];
      expect((call?.[0] as string)).toContain("Cleared CUNY session cookies");
    });
  });
});
