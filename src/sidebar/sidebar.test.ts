// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ── Static mocks — must be hoisted before any dynamic import of sidebar.ts ──

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    },
    runtime: { sendMessage: vi.fn() },
    tabs: { query: vi.fn(), sendMessage: vi.fn() },
  },
}));

vi.mock("../onboarding/devModes", () => ({
  DEV_MODE_NAMES: ["development", "e2e"],
}));

vi.mock("../onboarding/devQaJump", () => ({
  tryParseDevQaOnboardingJumpFromWindow: vi.fn(),
}));

vi.mock("../onboarding/resumeSession", () => ({
  clearResumeSnapshotSession: vi.fn().mockResolvedValue(undefined),
  loadResumeSnapshotFromSession: vi.fn(),
}));

vi.mock("../vaultSession/snapshot", () => ({
  loadVaultSessionSnapshot: vi.fn(),
}));

vi.mock("../onboarding/render", () => ({
  mountOnboarding: vi.fn(),
}));

// vaultController runs code at module scope — mock it as an empty module.
vi.mock("./vaultController", () => ({}));

// ── Imports used across tests ─────────────────────────────────────────────────

import { tryParseDevQaOnboardingJumpFromWindow } from "../onboarding/devQaJump";
import { loadResumeSnapshotFromSession } from "../onboarding/resumeSession";
import { loadVaultSessionSnapshot } from "../vaultSession/snapshot";
import type { VaultSessionSnapshot } from "../vaultSession/snapshot";
import type { DevQaJumpParseResult } from "../onboarding/devQaJump";

// ── Helpers ───────────────────────────────────────────────────────────────────

function noVaultSnapshot(): VaultSessionSnapshot {
  return {
    mode: "setup",
    storedVault: null,
    sessionMasterPassword: null,
    sessionPayload: null,
  };
}

function vaultSnapshot(): VaultSessionSnapshot {
  return {
    mode: "locked",
    storedVault: {
      salt: new Uint8Array(16),
      iv: new Uint8Array(12),
      ciphertext: new Uint8Array(32),
    } as unknown as import("../crypto/vault").StoredVault,
    sessionMasterPassword: null,
    sessionPayload: null,
  };
}

/** A minimal DevQaJumpParseResult (actual shape matches the real type). */
function fakeQaJump(): DevQaJumpParseResult {
  return {
    controllerInit: {
      initialState: "WELCOME",
      initialEmail: "test@login.cuny.edu",
      initialPassword: "password",
      initialCredentialError: null,
    },
  };
}

/** Boot sidebar.ts from a fresh module registry. */
async function bootSidebar(): Promise<void> {
  await import("./sidebar");
  // Allow the top-level `await bootSidebar()` to settle
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("sidebar boot — qaJump branch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubEnv("MODE", "development");

    vi.mocked(tryParseDevQaOnboardingJumpFromWindow).mockReturnValue(fakeQaJump());
    vi.mocked(loadVaultSessionSnapshot).mockResolvedValue(noVaultSnapshot());
    vi.mocked(loadResumeSnapshotFromSession).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("clearResumeSnapshotSession is called when qaJump is present", async () => {
    await bootSidebar();
    const { clearResumeSnapshotSession: clear } = await import("../onboarding/resumeSession");
    expect(vi.mocked(clear)).toHaveBeenCalledOnce();
  });

  test("mountOnboarding is called with the qaJump argument when qaJump is present", async () => {
    const jump = fakeQaJump();
    vi.mocked(tryParseDevQaOnboardingJumpFromWindow).mockReturnValue(jump);

    await bootSidebar();

    const { mountOnboarding } = await import("../onboarding/render");
    expect(vi.mocked(mountOnboarding)).toHaveBeenCalledOnce();
    expect(vi.mocked(mountOnboarding)).toHaveBeenCalledWith(
      document,
      { qaJump: jump }
    );
  });

  test("loadVaultSessionSnapshot is NOT called when qaJump is present", async () => {
    await bootSidebar();
    expect(vi.mocked(loadVaultSessionSnapshot)).not.toHaveBeenCalled();
  });
});

describe("sidebar boot — onboardingRequestedByDevHash branch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubEnv("MODE", "development");

    // No qaJump, but dev hash #onboarding=1 is set
    vi.mocked(tryParseDevQaOnboardingJumpFromWindow).mockReturnValue(null);
    vi.mocked(loadVaultSessionSnapshot).mockResolvedValue(noVaultSnapshot());
    vi.mocked(loadResumeSnapshotFromSession).mockResolvedValue(null);

    vi.stubGlobal(
      "location",
      Object.defineProperty(
        Object.create(window.location),
        "hash",
        { value: "#onboarding=1", writable: false }
      )
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("mountOnboarding is called without qaJump when dev hash is #onboarding=1", async () => {
    await bootSidebar();
    const { mountOnboarding } = await import("../onboarding/render");
    expect(vi.mocked(mountOnboarding)).toHaveBeenCalledOnce();
    // Called with just document — no second argument or options.qaJump
    const call = vi.mocked(mountOnboarding).mock.calls[0];
    expect(call[0]).toBe(document);
    expect(call[1]).toBeUndefined();
  });

  test("loadVaultSessionSnapshot is NOT called when dev hash triggers onboarding", async () => {
    await bootSidebar();
    expect(vi.mocked(loadVaultSessionSnapshot)).not.toHaveBeenCalled();
  });
});

describe("sidebar boot — no stored vault branch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubEnv("MODE", "production");

    vi.mocked(tryParseDevQaOnboardingJumpFromWindow).mockReturnValue(null);
    vi.mocked(loadVaultSessionSnapshot).mockResolvedValue(noVaultSnapshot());
    vi.mocked(loadResumeSnapshotFromSession).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("mountOnboarding is called when no stored vault exists", async () => {
    await bootSidebar();
    const { mountOnboarding } = await import("../onboarding/render");
    expect(vi.mocked(mountOnboarding)).toHaveBeenCalledOnce();
  });

  test("mountOnboarding is called with document as first argument", async () => {
    await bootSidebar();
    const { mountOnboarding } = await import("../onboarding/render");
    expect(vi.mocked(mountOnboarding)).toHaveBeenCalledWith(document);
  });

  test("vaultController is NOT imported (data-vault-ui not set)", async () => {
    await bootSidebar();
    expect(document.body.dataset.vaultUi).toBeUndefined();
  });
});

describe("sidebar boot — vault exists + resume snapshot branch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubEnv("MODE", "production");

    vi.mocked(tryParseDevQaOnboardingJumpFromWindow).mockReturnValue(null);
    vi.mocked(loadVaultSessionSnapshot).mockResolvedValue(vaultSnapshot());
    vi.mocked(loadResumeSnapshotFromSession).mockResolvedValue({
      state: "EMAIL_ENTRY",
      email: "student@login.cuny.edu",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("mountOnboarding is called when vault exists and resume snapshot is present", async () => {
    await bootSidebar();
    const { mountOnboarding } = await import("../onboarding/render");
    expect(vi.mocked(mountOnboarding)).toHaveBeenCalledOnce();
  });

  test("data-vault-ui is NOT set when resume snapshot is present", async () => {
    await bootSidebar();
    expect(document.body.dataset.vaultUi).toBeUndefined();
  });
});

describe("sidebar boot — vault exists, no resume → vault management branch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubEnv("MODE", "production");

    vi.mocked(tryParseDevQaOnboardingJumpFromWindow).mockReturnValue(null);
    vi.mocked(loadVaultSessionSnapshot).mockResolvedValue(vaultSnapshot());
    vi.mocked(loadResumeSnapshotFromSession).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("document.body.dataset.vaultUi is set to sidebar-management", async () => {
    await bootSidebar();
    expect(document.body.dataset.vaultUi).toBe("sidebar-management");
  });

  test("mountOnboarding is NOT called in vault management mode", async () => {
    await bootSidebar();
    const { mountOnboarding } = await import("../onboarding/render");
    expect(vi.mocked(mountOnboarding)).not.toHaveBeenCalled();
  });

  test("loadResumeSnapshotFromSession is called in vault management path", async () => {
    await bootSidebar();
    expect(vi.mocked(loadResumeSnapshotFromSession)).toHaveBeenCalledOnce();
  });
});

describe("sidebar boot — production mode: hashchange listener NOT registered", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubEnv("MODE", "production");

    vi.mocked(tryParseDevQaOnboardingJumpFromWindow).mockReturnValue(null);
    vi.mocked(loadVaultSessionSnapshot).mockResolvedValue(noVaultSnapshot());
    vi.mocked(loadResumeSnapshotFromSession).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("hashchange listener is NOT added to window in production mode", async () => {
    const addEventSpy = vi.spyOn(window, "addEventListener");

    await bootSidebar();

    const hashchangeCalls = addEventSpy.mock.calls.filter(
      ([type]) => type === "hashchange"
    );
    expect(hashchangeCalls).toHaveLength(0);

    addEventSpy.mockRestore();
  });
});

describe("sidebar boot — dev mode: hashchange listener IS registered", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubEnv("MODE", "development");

    vi.mocked(tryParseDevQaOnboardingJumpFromWindow).mockReturnValue(null);
    vi.mocked(loadVaultSessionSnapshot).mockResolvedValue(noVaultSnapshot());
    vi.mocked(loadResumeSnapshotFromSession).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("hashchange listener IS added to window in dev mode", async () => {
    const addEventSpy = vi.spyOn(window, "addEventListener");

    await bootSidebar();

    const hashchangeCalls = addEventSpy.mock.calls.filter(
      ([type]) => type === "hashchange"
    );
    expect(hashchangeCalls).toHaveLength(1);

    addEventSpy.mockRestore();
  });
});

describe("sidebar boot — onboardingRequestedByDevHash returns false in production", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubEnv("MODE", "production");

    vi.mocked(tryParseDevQaOnboardingJumpFromWindow).mockReturnValue(null);
    vi.mocked(loadVaultSessionSnapshot).mockResolvedValue(vaultSnapshot());
    vi.mocked(loadResumeSnapshotFromSession).mockResolvedValue(null);

    // Even though hash says onboarding=1, production mode should ignore it
    vi.stubGlobal(
      "location",
      Object.defineProperty(
        Object.create(window.location),
        "hash",
        { value: "#onboarding=1", writable: false }
      )
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("production mode ignores #onboarding=1 hash — proceeds to vault management", async () => {
    await bootSidebar();
    // Not onboarding, goes to vault management
    expect(document.body.dataset.vaultUi).toBe("sidebar-management");
  });
});
