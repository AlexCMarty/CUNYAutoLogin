// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from "vitest";
import { encryptVault } from "../crypto/vault";
import type { StoredVault, VaultPayload } from "../crypto/vault";
import { unwrap } from "../testUtils/resultUnwrap";
import { VAULT_STORAGE_KEY } from "../crypto/vault";
import { SESSION_MASTER_KEY } from "../cuny/ssoSite";
import { MIN_MASTER_PASSWORD_LENGTH, EXT_PASSWORD_MUST_DIFFER_FROM_CUNY_MSG } from "./sidebar.utils";
import type { VaultSessionSnapshot } from "../vaultSession/snapshot";

// ── Static mock registrations (must be before any dynamic import of the module) ──

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      session: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
  },
}));

vi.mock("../vaultSession/snapshot", () => ({
  loadVaultSessionSnapshot: vi.fn(),
}));

vi.mock("../crypto/biometric", () => ({
  isBiometricEnrolled: vi.fn().mockResolvedValue(false),
  unlockWithBiometric: vi.fn(),
  clearBiometricCredential: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../onboarding/resumeSession", () => ({
  clearResumeSnapshotSession: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_EMAIL = "student@login.cuny.edu";
const TEST_PASSWORD = "cuny-password-123";
const TEST_TOTP = "JBSWY3DPEHPK3PXP";
const MASTER = "correct-horse-battery-staple";

/** Build and inject the full vault sidebar HTML into document.body. */
function setupSidebarDom(): void {
  document.body.innerHTML = `
    <div id="status"></div>
    <div id="vault-locked-header"></div>
    <div id="vault-status-bar"></div>
    <div id="vault-totp-card"></div>
    <div id="vault-footer"></div>
    <div>
      <form id="vault-form">
        <div id="credential-fields">
          <label id="vault-email-label">CUNY email</label>
          <input id="email" type="email" />
          <label id="vault-password-label">CUNY password</label>
          <input id="password" type="password" />
          <input id="totpSecret" type="text" />
          <div id="totp-secret-source-hint" class="hidden"></div>
        </div>
        <div id="master-password-field">
          <label id="master-label">Extension password</label>
          <input id="masterPassword" type="password" />
        </div>
        <div id="change-master-section">
          <input id="newMasterPassword" type="password" />
          <input id="confirmNewMasterPassword" type="password" />
        </div>
        <div id="mode-hint"></div>
        <button id="submit-btn" type="submit">Unlock</button>
        <button id="lock-btn" type="button">Lock</button>
      </form>
    </div>
  `;
}

/** Build a locked snapshot (vault exists, no session master). */
async function makeLockedSnapshot(master = MASTER): Promise<VaultSessionSnapshot> {
  const vault = unwrap(await encryptVault({ email: TEST_EMAIL, password: TEST_PASSWORD, totpSecret: TEST_TOTP }, master));
  return {
    mode: "locked",
    storedVault: vault,
    sessionMasterPassword: null,
    sessionPayload: null,
  };
}

/** Build an unlocked snapshot (vault + session master + decrypted payload). */
async function makeUnlockedSnapshot(master = MASTER): Promise<VaultSessionSnapshot & { vault: StoredVault; payload: VaultPayload }> {
  const payload: VaultPayload = { email: TEST_EMAIL, password: TEST_PASSWORD, totpSecret: TEST_TOTP };
  const vault = unwrap(await encryptVault(payload, master));
  return {
    mode: "unlocked",
    storedVault: vault,
    sessionMasterPassword: master,
    sessionPayload: payload,
    vault,
    payload,
  };
}

/** Configure the loadVaultSessionSnapshot mock for this test. */
async function configureSnapshot(snapshot: VaultSessionSnapshot): Promise<void> {
  const { loadVaultSessionSnapshot } = await import("../vaultSession/snapshot");
  vi.mocked(loadVaultSessionSnapshot).mockResolvedValue(snapshot);
}

/** Load (or reload) the vaultController module and wait for init to settle. */
async function loadController(): Promise<void> {
  await import("./vaultController");
  // Allow microtasks and the init() promise to settle
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Submit the vault form. */
function submitForm(): void {
  const form = document.getElementById("vault-form") as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

/** Click the lock button. */
function clickLockBtn(): void {
  const lockBtn = document.getElementById("lock-btn") as HTMLButtonElement;
  lockBtn.click();
}

function getStatusText(): string {
  return document.getElementById("status")?.textContent ?? "";
}

function getSubmitBtnText(): string {
  return (document.getElementById("submit-btn") as HTMLButtonElement).textContent ?? "";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("vaultController — init from locked snapshot", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    await configureSnapshot(await makeLockedSnapshot());
    await loadController();
  });

  test("credential-fields has hidden class", () => {
    expect(document.getElementById("credential-fields")?.classList.contains("hidden")).toBe(true);
  });

  test("master-password-field does not have hidden class", () => {
    expect(document.getElementById("master-password-field")?.classList.contains("hidden")).toBe(false);
  });

  test("submit button shows Unlock", () => {
    expect(getSubmitBtnText()).toBe("Unlock");
  });

  test("lock button has hidden class", () => {
    expect(document.getElementById("lock-btn")?.classList.contains("hidden")).toBe(true);
  });
});

describe("vaultController — init from unlocked snapshot", () => {
  let snapshotData: Awaited<ReturnType<typeof makeUnlockedSnapshot>>;

  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    snapshotData = await makeUnlockedSnapshot();
    await configureSnapshot(snapshotData);
    await loadController();
  });

  test("credential-fields does not have hidden class", () => {
    expect(document.getElementById("credential-fields")?.classList.contains("hidden")).toBe(false);
  });

  test("submit button shows Save changes", () => {
    expect(getSubmitBtnText()).toBe("Save changes");
  });

  test("lock button does not have hidden class", () => {
    expect(document.getElementById("lock-btn")?.classList.contains("hidden")).toBe(false);
  });

  test("email input is populated from payload", () => {
    expect((document.getElementById("email") as HTMLInputElement).value).toBe(TEST_EMAIL);
  });

  test("password input is populated from payload", () => {
    expect((document.getElementById("password") as HTMLInputElement).value).toBe(TEST_PASSWORD);
  });

  test("totpSecret input is populated from payload", () => {
    expect((document.getElementById("totpSecret") as HTMLInputElement).value).toBe(TEST_TOTP);
  });
});

describe("vaultController — missing DOM element → silent bail", () => {
  test("init does not throw when a required element is absent", async () => {
    vi.resetModules();
    // Omit credential-fields so getEls() returns missing_dom
    document.body.innerHTML = `
      <div id="status"></div>
      <form id="vault-form">
        <input id="email" type="email" />
        <input id="password" type="password" />
        <input id="totpSecret" type="text" />
        <div id="totp-secret-source-hint"></div>
        <input id="masterPassword" type="password" />
        <div id="master-label"></div>
        <input id="newMasterPassword" type="password" />
        <input id="confirmNewMasterPassword" type="password" />
        <button id="submit-btn" type="submit">Unlock</button>
        <button id="lock-btn" type="button">Lock</button>
        <div id="mode-hint"></div>
        <div id="master-password-field"></div>
        <div id="change-master-section"></div>
      </form>
    `;
    // credential-fields is intentionally missing

    const { loadVaultSessionSnapshot } = await import("../vaultSession/snapshot");
    vi.mocked(loadVaultSessionSnapshot).mockResolvedValue({
      mode: "locked",
      storedVault: null,
      sessionMasterPassword: null,
      sessionPayload: null,
    });

    // Should not throw
    await expect(loadController()).resolves.toBeUndefined();
  });
});

describe("vaultController — locked mode form validation", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    await configureSnapshot(await makeLockedSnapshot());
    await loadController();
  });

  test("empty master password → prompts user to enter password", async () => {
    (document.getElementById("masterPassword") as HTMLInputElement).value = "";
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toBe("Enter your extension password to unlock.");
    });
  });

  test("wrong master password → status reflects decrypt error", async () => {
    (document.getElementById("masterPassword") as HTMLInputElement).value = "wrong-password!!!!";
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Wrong extension password");
    });
  });

  test("correct master password → mode switches to unlocked", async () => {
    (document.getElementById("masterPassword") as HTMLInputElement).value = MASTER;
    submitForm();
    await vi.waitFor(() => {
      expect(getSubmitBtnText()).toBe("Save changes");
    });
  });

  test("correct master password → credential-fields becomes visible", async () => {
    (document.getElementById("masterPassword") as HTMLInputElement).value = MASTER;
    submitForm();
    await vi.waitFor(() => {
      expect(document.getElementById("credential-fields")?.classList.contains("hidden")).toBe(false);
    });
  });

  test("correct master password → masterPassword field is cleared", async () => {
    (document.getElementById("masterPassword") as HTMLInputElement).value = MASTER;
    submitForm();
    await vi.waitFor(() => {
      expect((document.getElementById("masterPassword") as HTMLInputElement).value).toBe("");
    });
  });

  test("correct master password → session master written to storage.session", async () => {
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    (document.getElementById("masterPassword") as HTMLInputElement).value = MASTER;
    submitForm();
    await vi.waitFor(() => {
      expect(browser.storage.session.set).toHaveBeenCalledWith(
        expect.objectContaining({ [SESSION_MASTER_KEY]: MASTER })
      );
    });
  });
});

async function setupUnlockedController(): Promise<void> {
  vi.resetModules();
  setupSidebarDom();
  const snap = await makeUnlockedSnapshot();
  await configureSnapshot(snap);
  const browser = (await import("webextension-polyfill")).default;
  vi.mocked(browser.storage.local.set).mockResolvedValue();
  vi.mocked(browser.storage.session.set).mockResolvedValue();
  await loadController();
}

describe("vaultController — unlocked mode: email/password/totp validation", () => {
  beforeEach(setupUnlockedController);

  test("invalid email → status warns about suffix", async () => {
    (document.getElementById("email") as HTMLInputElement).value = "student@gmail.com";
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toContain("@login.cuny.edu");
    });
  });

  test("empty password → Password is required", async () => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = "";
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toBe("Password is required.");
    });
  });

  test("empty totpSecret (non-management) → TOTP secret is required", async () => {
    document.body.removeAttribute("data-vault-ui");
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = "";
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toBe("TOTP secret is required.");
    });
  });
});

describe("vaultController — unlocked mode: master password change validation", () => {
  beforeEach(setupUnlockedController);

  test("new master mismatch → New extension passwords do not match", async () => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    (document.getElementById("newMasterPassword") as HTMLInputElement).value = "a-different-long-password";
    (document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value = "mismatch-long-password";
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toBe("New extension passwords do not match.");
    });
  });

  test("new master too short → length error", async () => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    const shortMaster = "short";
    (document.getElementById("newMasterPassword") as HTMLInputElement).value = shortMaster;
    (document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value = shortMaster;
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toContain(`${MIN_MASTER_PASSWORD_LENGTH} characters`);
    });
  });

  test("new master equals CUNY password → EXT_PASSWORD_MUST_DIFFER_FROM_CUNY_MSG", async () => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    // Use TEST_PASSWORD as both new master fields
    (document.getElementById("newMasterPassword") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value = TEST_PASSWORD;
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toBe(EXT_PASSWORD_MUST_DIFFER_FROM_CUNY_MSG);
    });
  });

  test("only newMasterPassword filled (confirm empty) → fill both fields message", async () => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    (document.getElementById("newMasterPassword") as HTMLInputElement).value = "some-long-new-password";
    (document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value = "";
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Fill both new extension password fields");
    });
  });

  test("only confirmNewMasterPassword filled (new empty) → fill both fields message", async () => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    (document.getElementById("newMasterPassword") as HTMLInputElement).value = "";
    (document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value = "some-long-new-password";
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Fill both new extension password fields");
    });
  });
});

describe("vaultController — unlocked mode: happy path save", () => {
  beforeEach(setupUnlockedController);

  test("happy path → vault re-encrypted and written to storage.local", async () => {
    const browser = (await import("webextension-polyfill")).default;
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    submitForm();
    await vi.waitFor(() => {
      expect(browser.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ [VAULT_STORAGE_KEY]: expect.any(Object) })
      );
    });
  });

  test("happy path → success status set", async () => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Changes saved");
    });
  });

  test("happy path → newMasterPassword and confirmNewMasterPassword are cleared after save", async () => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    submitForm();
    await vi.waitFor(() => {
      expect((document.getElementById("newMasterPassword") as HTMLInputElement).value).toBe("");
      expect((document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value).toBe("");
    });
  });
});

describe("vaultController — unlocked mode with changed master password", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    const snap = await makeUnlockedSnapshot();
    await configureSnapshot(snap);
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.local.set).mockResolvedValue();
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    await loadController();
  });

  test("changed master → clearBiometricCredential is called", async () => {
    const { clearBiometricCredential } = await import("../crypto/biometric");
    const newMaster = "brand-new-extension-password-x";

    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    (document.getElementById("newMasterPassword") as HTMLInputElement).value = newMaster;
    (document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value = newMaster;
    submitForm();

    await vi.waitFor(() => {
      expect(clearBiometricCredential).toHaveBeenCalled();
    });
  });
});

describe("vaultController — management mode TOTP handling", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    document.body.dataset.vaultUi = "sidebar-management";
    const snap = await makeUnlockedSnapshot();
    await configureSnapshot(snap);
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.local.set).mockResolvedValue();
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    await loadController();
  });

  test("empty totpSecret in management mode → management-specific error when session totp also missing", async () => {
    // This tests the case where management mode has no session totp payload and field is empty.
    // We need to reload with a snapshot that has no totpSecret in the payload.
    vi.resetModules();
    setupSidebarDom();
    document.body.dataset.vaultUi = "sidebar-management";

    // Construct a snapshot where sessionPayload has empty totpSecret (unusual but possible)
    const payload: VaultPayload = { email: TEST_EMAIL, password: TEST_PASSWORD, totpSecret: "" };
    const vault = unwrap(await encryptVault(payload, MASTER));
    const snap: VaultSessionSnapshot = {
      mode: "unlocked",
      storedVault: vault,
      sessionMasterPassword: MASTER,
      sessionPayload: payload,
    };
    await configureSnapshot(snap);
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.local.set).mockResolvedValue();
    await loadController();

    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = "";
    submitForm();

    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Could not read your login code secret");
    });
  });
});

describe("vaultController — lock button", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    const snap = await makeUnlockedSnapshot();
    await configureSnapshot(snap);
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.session.remove).mockResolvedValue();
    await loadController();
  });

  test("lock button → mode switches back to locked (submit text = Unlock)", async () => {
    clickLockBtn();
    await vi.waitFor(() => {
      expect(getSubmitBtnText()).toBe("Unlock");
    });
  });

  test("lock button → credential-fields gets hidden class", async () => {
    clickLockBtn();
    await vi.waitFor(() => {
      expect(document.getElementById("credential-fields")?.classList.contains("hidden")).toBe(true);
    });
  });

  test("lock button → session master removed from storage.session", async () => {
    const browser = (await import("webextension-polyfill")).default;
    clickLockBtn();
    await vi.waitFor(() => {
      expect(browser.storage.session.remove).toHaveBeenCalledWith(SESSION_MASTER_KEY);
    });
  });

  test("lock button → status is cleared", async () => {
    // First set a status so we can verify it gets cleared
    document.getElementById("status")!.textContent = "Previous status";
    clickLockBtn();
    await vi.waitFor(() => {
      expect(getStatusText()).toBe("");
    });
  });
});
