// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { okAsync } from "neverthrow";
import { encryptVault, decryptVault, LEGACY_PBKDF2_ITERATIONS_V1, PBKDF2_ITERATIONS } from "../crypto/vault";
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
    <div id="vault-totp-card">
      <button type="button" id="advanced-toggle" aria-expanded="false" aria-controls="advanced-body">Advanced</button>
      <div id="advanced-body" hidden>
        <button type="button" id="show-secret-btn">Show secret key</button>
        <div id="secret-block" hidden>
          <div id="secret-value" aria-label="Secret key"></div>
          <button type="button" id="copy-secret-btn"><span>Copy</span></button>
          <button type="button" id="hide-secret-btn"><span>Hide</span></button>
        </div>
      </div>
    </div>
    <div id="vault-footer"></div>
    <div>
      <form id="vault-form">
        <div id="credential-fields">
          <label id="vault-email-label">CUNY email</label>
          <input id="email" type="email" />
          <label id="vault-password-label">CUNY password</label>
          <input id="password" type="password" />
          <input id="totpSecret" type="text" />
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

/**
 * Build a legacy v1 vault (PBKDF2 @ LEGACY_PBKDF2_ITERATIONS_V1, no `iterations`
 * field) — the on-disk shape of a real pre-v2 user, used to drive the
 * migrate-on-unlock path. encryptVault now emits v3, so this fabricates v1 directly.
 */
async function makeLegacyV1Vault(master = MASTER): Promise<StoredVault> {
  const plaintext = JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, totpSecret: TEST_TOTP });
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(master), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: LEGACY_PBKDF2_ITERATIONS_V1, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
  return {
    version: 1,
    saltB64: toB64(salt),
    ivB64: toB64(iv),
    ciphertextB64: toB64(new Uint8Array(ciphertext)),
  };
}

/**
 * Build a legacy v2 vault (PBKDF2 @ PBKDF2_ITERATIONS) — the on-disk shape of a
 * v0.10.x user before Argon2id. encryptVault now emits v3.
 */
async function makeLegacyV2Vault(master = MASTER): Promise<StoredVault> {
  const plaintext = JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, totpSecret: TEST_TOTP });
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(master), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
  return {
    version: 2,
    iterations: PBKDF2_ITERATIONS,
    saltB64: toB64(salt),
    ivB64: toB64(iv),
    ciphertextB64: toB64(new Uint8Array(ciphertext)),
  };
}

/** Locked snapshot whose stored vault is a legacy v1 blob. */
async function makeLegacyLockedSnapshot(master = MASTER): Promise<VaultSessionSnapshot> {
  return {
    mode: "locked",
    storedVault: await makeLegacyV1Vault(master),
    sessionMasterPassword: null,
    sessionPayload: null,
  };
}

/** Locked snapshot whose stored vault is a legacy v2 blob. */
async function makeLegacyV2LockedSnapshot(master = MASTER): Promise<VaultSessionSnapshot> {
  return {
    mode: "locked",
    storedVault: await makeLegacyV2Vault(master),
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

/**
 * The webextension-polyfill mock is shared across parallel test files. After a save,
 * wait until a vault in local.set calls (from `sinceCallIndex` onward) decrypts with
 * `master` — not merely until any file writes any vault.
 */
async function waitForVaultWrittenWithMaster(
  localSetMock: Mock,
  master: string,
  sinceCallIndex: number
): Promise<StoredVault> {
  let written: StoredVault | undefined;
  await vi.waitFor(async () => {
    const calls = localSetMock.mock.calls.slice(sinceCallIndex);
    for (const call of calls) {
      const record = call[0] as Record<string, unknown>;
      if (!(VAULT_STORAGE_KEY in record)) continue;
      const candidate = record[VAULT_STORAGE_KEY] as StoredVault;
      if ((await decryptVault(candidate, master)).isOk()) {
        written = candidate;
        return;
      }
    }
    throw new Error("vault not yet written with expected master");
  });
  return written!;
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

async function setupUnlockedController(
  options: { readonly managementMode?: boolean } = {}
): Promise<void> {
  vi.resetModules();
  setupSidebarDom();
  if (options.managementMode) {
    document.body.dataset.vaultUi = "sidebar-management";
  }
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
  beforeEach(() => setupUnlockedController());

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
  beforeEach(() => setupUnlockedController({ managementMode: true }));

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

// ── master-not-in-local [HIGH] ────────────────────────────────────────────────
// Hard rule: the master (extension) password must NEVER appear in storage.local
// in any form.  The existing happy-path test only checks the key name; these
// tests go further and assert the stored JSON excludes every plaintext secret.

describe("vaultController — master password never in storage.local", () => {
  beforeEach(setupUnlockedController);

  test("storage.local.set is never called with SESSION_MASTER_KEY as a key", async () => {
    const browser = (await import("webextension-polyfill")).default;
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    submitForm();

    await vi.waitFor(() => {
      expect(browser.storage.local.set).toHaveBeenCalled();
    });

    // None of the calls should pass SESSION_MASTER_KEY as a top-level key
    const calls = vi.mocked(browser.storage.local.set).mock.calls;
    for (const [arg] of calls) {
      expect(Object.keys(arg as object)).not.toContain(SESSION_MASTER_KEY);
    }
  });

  test("vault written to storage.local contains neither the master nor the CUNY password in plaintext", async () => {
    const browser = (await import("webextension-polyfill")).default;
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    submitForm();

    await vi.waitFor(() => {
      expect(browser.storage.local.set).toHaveBeenCalled();
    });

    const calls = vi.mocked(browser.storage.local.set).mock.calls;
    for (const [arg] of calls) {
      const serialized = JSON.stringify(arg);
      expect(serialized).not.toContain(MASTER);
      expect(serialized).not.toContain(TEST_PASSWORD);
    }
  });
});

// ── unlock-populates-fields [HIGH] ────────────────────────────────────────────
// After a correct-master unlock, the email / password / totp fields must be
// populated from the freshly decrypted session payload.

describe("vaultController — unlock populates credential fields from decrypted payload", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    await configureSnapshot(await makeLockedSnapshot());
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    await loadController();
  });

  test("after correct master submit, email input equals TEST_EMAIL", async () => {
    (document.getElementById("masterPassword") as HTMLInputElement).value = MASTER;
    submitForm();
    await vi.waitFor(() => {
      expect((document.getElementById("email") as HTMLInputElement).value).toBe(TEST_EMAIL);
    });
  });

  test("after correct master submit, password input equals TEST_PASSWORD", async () => {
    (document.getElementById("masterPassword") as HTMLInputElement).value = MASTER;
    submitForm();
    await vi.waitFor(() => {
      expect((document.getElementById("password") as HTMLInputElement).value).toBe(TEST_PASSWORD);
    });
  });

  test("after correct master submit, totpSecret input equals TEST_TOTP", async () => {
    (document.getElementById("masterPassword") as HTMLInputElement).value = MASTER;
    submitForm();
    await vi.waitFor(() => {
      expect((document.getElementById("totpSecret") as HTMLInputElement).value).toBe(TEST_TOTP);
    });
  });
});

// ── locked-disabled-reenable [MEDIUM] ─────────────────────────────────────────
// handleLocked disables the submit button during the async decrypt and MUST
// re-enable it on failure so the user can try again.

describe("vaultController — submit button re-enabled after wrong-password failure", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    await configureSnapshot(await makeLockedSnapshot());
    await loadController();
  });

  test("submit button is not disabled after a wrong-password attempt", async () => {
    (document.getElementById("masterPassword") as HTMLInputElement).value = "wrong-password!!!!";
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Wrong extension password");
    });
    expect((document.getElementById("submit-btn") as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── data-vault-ui-leak [MEDIUM] ───────────────────────────────────────────────
// `setupSidebarDom` resets body.innerHTML but not body.dataset, so
// `data-vault-ui="sidebar-management"` can leak from the management-mode suite
// into later tests.  We guard against this with an afterEach cleanup and a
// regression assertion inside the lock-button suite (which runs after the
// management suite and must not see the attribute).

describe("vaultController — data-vault-ui attribute isolation", () => {
  afterEach(() => {
    document.body.removeAttribute("data-vault-ui");
  });

  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    // Simulate a management-mode test that set the attribute
    document.body.dataset.vaultUi = "sidebar-management";
    const snap = await makeUnlockedSnapshot();
    await configureSnapshot(snap);
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.local.set).mockResolvedValue();
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    await loadController();
  });

  test("after afterEach runs, body has no data-vault-ui attribute", () => {
    // This test body runs before afterEach; it just confirms the attribute IS
    // present inside the test (as set up by beforeEach).  The real isolation
    // check is the next describe's regression test.
    expect(document.body.dataset.vaultUi).toBe("sidebar-management");
  });
});

describe("vaultController — lock-button suite sees no management attribute (leak regression)", () => {
  // afterEach in the preceding describe should have cleaned up; verify here.
  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    const snap = await makeUnlockedSnapshot();
    await configureSnapshot(snap);
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.session.remove).mockResolvedValue();
    await loadController();
  });

  test("body has no data-vault-ui attribute at start of this suite", () => {
    expect(document.body.dataset.vaultUi).toBeUndefined();
  });
});

// ── mgmt-totp-fallback-happy [HIGH] ──────────────────────────────────────────
// In sidebar-management mode, an EMPTY totpSecret field must succeed by
// falling back to the session payload's TOTP secret.  The saved vault must
// round-trip back to the original TEST_TOTP value.

describe("vaultController — management mode: empty TOTP field falls back to session payload TOTP", () => {
  afterEach(() => {
    document.body.removeAttribute("data-vault-ui");
  });

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

  test("save succeeds when totpSecret field is empty in management mode", async () => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    // Deliberately clear the TOTP field — management mode should fall back to session payload
    (document.getElementById("totpSecret") as HTMLInputElement).value = "";
    submitForm();

    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Changes saved");
    });
  });

  test("vault written with empty TOTP field decrypts back to TEST_TOTP", async () => {
    const browser = (await import("webextension-polyfill")).default;
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = "";
    submitForm();

    await vi.waitFor(() => {
      expect(browser.storage.local.set).toHaveBeenCalled();
    });

    // Extract the stored vault object from the most recent local.set call
    const calls = vi.mocked(browser.storage.local.set).mock.calls;
    const lastCall = calls[calls.length - 1]!;
    const written = (lastCall[0] as Record<string, unknown>)[VAULT_STORAGE_KEY];

    // Decrypt with the session master and verify TOTP is preserved
    const decResult = await decryptVault(written as StoredVault, MASTER);
    expect(decResult.isOk()).toBe(true);
    if (decResult.isOk()) {
      expect(decResult.value.totpSecret).toBe(TEST_TOTP);
    }
  });
});

// ── sidebar/changed-master-only-clears-bio [MEDIUM] ───────────────────────────
describe("vaultController — changed master re-encrypts under the new master", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupSidebarDom();
    await configureSnapshot(await makeUnlockedSnapshot());
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.local.set).mockResolvedValue();
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    await loadController();
  });

  test("written vault decrypts with the NEW master and NOT the old; new master is staged to session", async () => {
    const browser = (await import("webextension-polyfill")).default;
    const newMaster = "brand-new-extension-password-x";
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    (document.getElementById("newMasterPassword") as HTMLInputElement).value = newMaster;
    (document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value = newMaster;
    // The polyfill mock is module-global; clear so we only observe calls from this save onward.
    vi.mocked(browser.storage.local.set).mockClear();
    vi.mocked(browser.storage.session.set).mockClear();
    const localSetCallsAtStart = vi.mocked(browser.storage.local.set).mock.calls.length;
    submitForm();

    const written = await waitForVaultWrittenWithMaster(
      vi.mocked(browser.storage.local.set),
      newMaster,
      localSetCallsAtStart
    );

    expect((await decryptVault(written, newMaster)).isOk()).toBe(true);
    expect((await decryptVault(written, MASTER)).isErr()).toBe(true);
    expect(browser.storage.session.set).toHaveBeenCalledWith(
      expect.objectContaining({ [SESSION_MASTER_KEY]: newMaster })
    );
  });
});

// ── sidebar/session-expired-empty-master [MEDIUM] ─────────────────────────────
describe("vaultController — save with no session master and empty new-master fields", () => {
  test("aborts with the 'Session expired' message instead of re-encrypting with a null master", async () => {
    vi.resetModules();
    setupSidebarDom();
    const payload: VaultPayload = { email: TEST_EMAIL, password: TEST_PASSWORD, totpSecret: TEST_TOTP };
    const vault = unwrap(await encryptVault(payload, MASTER));
    await configureSnapshot({
      mode: "unlocked",
      storedVault: vault,
      sessionMasterPassword: null,
      sessionPayload: payload,
    });
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.local.set).mockResolvedValue();
    await loadController();

    // New-master fields left empty; populated credential fields are valid.
    // The polyfill mock is module-global; clear so we only observe THIS save.
    vi.mocked(browser.storage.local.set).mockClear();
    submitForm();

    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Session expired");
    });
    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });
});

// ── sidebar/save-failed-encrypt-error [MEDIUM] ────────────────────────────────
describe("vaultController — encryptVault failure on save", () => {
  beforeEach(setupUnlockedController);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows 'Save failed' and re-enables the submit button when encryption fails", async () => {
    vi.spyOn(globalThis.crypto.subtle, "encrypt").mockRejectedValue(new Error("crypto down"));

    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
    submitForm();

    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Save failed");
    });
    expect((document.getElementById("submit-btn") as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── sidebar/min-length-tautology [LOW] — real boundary in vaultController ──────
describe("vaultController — new master length boundary on save", () => {
  beforeEach(setupUnlockedController);

  const fillCreds = (): void => {
    (document.getElementById("email") as HTMLInputElement).value = TEST_EMAIL;
    (document.getElementById("password") as HTMLInputElement).value = TEST_PASSWORD;
    (document.getElementById("totpSecret") as HTMLInputElement).value = TEST_TOTP;
  };

  test(`a ${MIN_MASTER_PASSWORD_LENGTH - 1}-char new master is rejected as too short`, async () => {
    const tooShort = "a".repeat(MIN_MASTER_PASSWORD_LENGTH - 1);
    fillCreds();
    (document.getElementById("newMasterPassword") as HTMLInputElement).value = tooShort;
    (document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value = tooShort;
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toContain(`at least ${MIN_MASTER_PASSWORD_LENGTH} characters`);
    });
  });

  test(`a ${MIN_MASTER_PASSWORD_LENGTH}-char new master is accepted`, async () => {
    const atMin = "a".repeat(MIN_MASTER_PASSWORD_LENGTH); // 12 chars, differs from CUNY password
    fillCreds();
    (document.getElementById("newMasterPassword") as HTMLInputElement).value = atMin;
    (document.getElementById("confirmNewMasterPassword") as HTMLInputElement).value = atMin;
    submitForm();
    await vi.waitFor(() => {
      expect(getStatusText()).toContain("Changes saved");
    });
  });
});

// ── sidebar/init-mode-header-panels-untested [LOW] ────────────────────────────
describe("vaultController — header panel visibility per mode", () => {
  const panelHidden = (id: string): boolean =>
    (document.getElementById(id) as HTMLElement).hidden;

  afterEach(() => {
    document.body.removeAttribute("data-vault-ui");
  });

  test("locked mode: locked header + footer shown; totp card hidden", async () => {
    vi.resetModules();
    setupSidebarDom();
    await configureSnapshot(await makeLockedSnapshot());
    await loadController();

    expect(panelHidden("vault-locked-header")).toBe(false);
    expect(panelHidden("vault-footer")).toBe(false);
    expect(panelHidden("vault-totp-card")).toBe(true);
  });

  test("unlocked non-management: locked header, footer, totp card hidden", async () => {
    await setupUnlockedController();

    expect(panelHidden("vault-locked-header")).toBe(true);
    expect(panelHidden("vault-footer")).toBe(true);
    expect(panelHidden("vault-totp-card")).toBe(true);
  });

  test("unlocked management mode: totp card is shown", async () => {
    vi.resetModules();
    setupSidebarDom();
    document.body.dataset.vaultUi = "sidebar-management";
    await configureSnapshot(await makeUnlockedSnapshot());
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.storage.local.set).mockResolvedValue();
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    await loadController();

    expect(panelHidden("vault-totp-card")).toBe(false);
    expect(panelHidden("vault-locked-header")).toBe(true);
    expect(panelHidden("vault-footer")).toBe(true);
  });
});

describe("vaultController — Advanced secret-key reveal", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    // Reveal lives in the post-onboarding management sidebar.
    document.body.dataset.vaultUi = "sidebar-management";
    await setupUnlockedController();
  });

  const advToggle = (): HTMLButtonElement =>
    document.getElementById("advanced-toggle") as HTMLButtonElement;
  const advBody = (): HTMLElement => document.getElementById("advanced-body") as HTMLElement;
  const showBtn = (): HTMLButtonElement =>
    document.getElementById("show-secret-btn") as HTMLButtonElement;
  const secretBlock = (): HTMLElement => document.getElementById("secret-block") as HTMLElement;
  const secretValue = (): HTMLElement => document.getElementById("secret-value") as HTMLElement;
  const copyBtn = (): HTMLButtonElement =>
    document.getElementById("copy-secret-btn") as HTMLButtonElement;
  const hideBtn = (): HTMLButtonElement =>
    document.getElementById("hide-secret-btn") as HTMLButtonElement;

  test("starts collapsed and concealed", () => {
    expect(advToggle().getAttribute("aria-expanded")).toBe("false");
    expect(advBody().hidden).toBe(true);
    expect(secretBlock().hidden).toBe(true);
  });

  test("toggling Advanced expands the body but keeps the key behind Show", () => {
    advToggle().click();
    expect(advToggle().getAttribute("aria-expanded")).toBe("true");
    expect(advBody().hidden).toBe(false);
    expect(secretBlock().hidden).toBe(true);
    expect(showBtn().hidden).toBe(false);
  });

  test("Show secret key reveals the secret grouped in 4-char blocks", () => {
    advToggle().click();
    showBtn().click();
    expect(secretBlock().hidden).toBe(false);
    expect(showBtn().hidden).toBe(true);
    expect(secretValue().textContent).toBe("JBSW Y3DP EHPK 3PXP");
  });

  test("Copy writes the raw ungrouped secret to the clipboard and confirms", async () => {
    advToggle().click();
    showBtn().click();
    copyBtn().click();
    await vi.waitFor(() => {
      expect(copyBtn().classList.contains("is-ok")).toBe(true);
    });
    expect(writeText).toHaveBeenCalledWith(TEST_TOTP);
    expect(copyBtn().querySelector("span")?.textContent).toBe("Copied");
  });

  test("Hide re-conceals the revealed secret", () => {
    advToggle().click();
    showBtn().click();
    hideBtn().click();
    expect(secretBlock().hidden).toBe(true);
    expect(showBtn().hidden).toBe(false);
  });

  test("collapsing Advanced re-conceals a revealed key", () => {
    advToggle().click();
    showBtn().click();
    advToggle().click();
    expect(advBody().hidden).toBe(true);
    expect(secretBlock().hidden).toBe(true);
    expect(showBtn().hidden).toBe(false);
  });

  test("locking resets the reveal to collapsed and concealed", async () => {
    advToggle().click();
    showBtn().click();
    clickLockBtn();
    await vi.waitFor(() => {
      expect(advToggle().getAttribute("aria-expanded")).toBe("false");
    });
    expect(advBody().hidden).toBe(true);
    expect(secretBlock().hidden).toBe(true);
  });
});

// ── sidebar/vault-kdf-migration — v1/v2 → v3 re-encrypt on unlock ─────────────
// eslint-disable-next-line max-lines-per-function
describe("vaultController — KDF migration on unlock (v1/v2 → v3)", () => {
  beforeEach(() => {
    vi.resetModules();
    setupSidebarDom();
  });

  /** Init the controller from the configured snapshot, then submit the unlock form. */
  async function unlockWith(master: string): Promise<void> {
    await loadController();
    (document.getElementById("masterPassword") as HTMLInputElement).value = master;
    submitForm();
  }

  /** Vault writes since `since` whose blob decrypts with `master` (robust to the
   *  shared cross-file mock — different-master writes are filtered out). */
  async function vaultWritesForMaster(
    localSet: Mock,
    master: string,
    since: number
  ): Promise<StoredVault[]> {
    const matches: StoredVault[] = [];
    for (const call of localSet.mock.calls.slice(since)) {
      const record = call[0] as Record<string, unknown>;
      if (!(VAULT_STORAGE_KEY in record)) continue;
      const candidate = record[VAULT_STORAGE_KEY] as StoredVault;
      if ((await decryptVault(candidate, master)).isOk()) matches.push(candidate);
    }
    return matches;
  }

  test("a legacy v1 vault is re-encrypted to v3 (Argon2id) on first unlock", async () => {
    const browser = (await import("webextension-polyfill")).default;
    const localSet = vi.mocked(browser.storage.local.set);
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    localSet.mockResolvedValue();

    await configureSnapshot(await makeLegacyLockedSnapshot());
    const before = localSet.mock.calls.length;
    await unlockWith(MASTER);

    const written = await waitForVaultWrittenWithMaster(localSet, MASTER, before);
    expect(written.version).toBe(3);
    if (written.version === 3) {
      expect(written.memorySize).toBe(19 * 1024);
      expect(written.passes).toBe(2);
      expect(written.parallelism).toBe(1);
    }
    // The migrated blob still yields the original credentials.
    expect(unwrap(await decryptVault(written, MASTER))).toEqual({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      totpSecret: TEST_TOTP,
    });
  });

  test("a legacy v2 vault is re-encrypted to v3 (Argon2id) on first unlock", async () => {
    const browser = (await import("webextension-polyfill")).default;
    const localSet = vi.mocked(browser.storage.local.set);
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    localSet.mockResolvedValue();

    await configureSnapshot(await makeLegacyV2LockedSnapshot());
    const before = localSet.mock.calls.length;
    await unlockWith(MASTER);

    const written = await waitForVaultWrittenWithMaster(localSet, MASTER, before);
    expect(written.version).toBe(3);
    expect(unwrap(await decryptVault(written, MASTER))).toEqual({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      totpSecret: TEST_TOTP,
    });
  });

  test("an already-v3 vault is not re-written on unlock", async () => {
    const browser = (await import("webextension-polyfill")).default;
    const localSet = vi.mocked(browser.storage.local.set);
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    localSet.mockResolvedValue();

    await configureSnapshot(await makeLockedSnapshot()); // encryptVault → v3
    const before = localSet.mock.calls.length;
    await unlockWith(MASTER);

    // Unlock completes (submit flips to "Save changes") — migration runs synchronously
    // before that point, so any re-write would already be visible.
    await vi.waitFor(() => expect(getSubmitBtnText()).toBe("Save changes"));
    expect(await vaultWritesForMaster(localSet, MASTER, before)).toHaveLength(0);
  });

  test("a v1 unlock with the wrong master neither unlocks nor migrates", async () => {
    const browser = (await import("webextension-polyfill")).default;
    const localSet = vi.mocked(browser.storage.local.set);
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    localSet.mockResolvedValue();

    await configureSnapshot(await makeLegacyLockedSnapshot());
    const before = localSet.mock.calls.length;
    await unlockWith("wrong-password");

    await vi.waitFor(() => expect(getStatusText().length).toBeGreaterThan(0));
    expect(await vaultWritesForMaster(localSet, MASTER, before)).toHaveLength(0);
  });

  test("a persist failure during migration leaves the user unlocked (best-effort, never blocks unlock)", async () => {
    const browser = (await import("webextension-polyfill")).default;
    const localSet = vi.mocked(browser.storage.local.set);
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    // The only storage.local.set in the unlock path is the migration re-encrypt;
    // make it reject to simulate a persist failure mid-migration.
    localSet.mockRejectedValue(new Error("quota exceeded"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await configureSnapshot(await makeLegacyLockedSnapshot());
    await unlockWith(MASTER);

    // The user authenticated correctly; a failed re-encrypt must degrade to "still
    // unlocked", not a lockout. Unlock completing flips submit to "Save changes",
    // and the status is cleared (no error, no stuck "Securing your vault…").
    await vi.waitFor(() => expect(getSubmitBtnText()).toBe("Save changes"));
    expect(getStatusText()).toBe("");
    warn.mockRestore();
  });

  test("a re-encrypt failure during migration leaves the user unlocked (no blob written)", async () => {
    const browser = (await import("webextension-polyfill")).default;
    const localSet = vi.mocked(browser.storage.local.set);
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    localSet.mockResolvedValue();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Build the v1 fixture FIRST (it uses crypto.subtle.encrypt), then fail only
    // the NEXT encrypt — the migration re-encrypt. The unlock's own step is a
    // decrypt, so this targets the migration precisely without breaking the unlock.
    await configureSnapshot(await makeLegacyLockedSnapshot());
    const before = localSet.mock.calls.length;
    const encryptSpy = vi
      .spyOn(crypto.subtle, "encrypt")
      .mockRejectedValueOnce(new Error("WebCrypto encrypt failure"));

    await unlockWith(MASTER);

    await vi.waitFor(() => expect(getSubmitBtnText()).toBe("Save changes"));
    expect(getStatusText()).toBe("");
    // Re-encrypt failed before any persist, so nothing was written to storage.
    expect(await vaultWritesForMaster(localSet, MASTER, before)).toHaveLength(0);
    encryptSpy.mockRestore();
    warn.mockRestore();
  });
});

// ── sidebar/vault-kdf-migration-biometric — v1 → v3 on biometric unlock ───────
// The commit wires migration into BOTH the password and biometric unlock paths;
// only the password half was covered. Biometric is a primary unlock method for the
// target users, so a regression that dropped applyVaultMigration from the biometric
// handler would silently strand those users on a legacy KDF forever.
describe("vaultController — KDF migration on biometric unlock (v1 → v3)", () => {
  beforeEach(() => {
    vi.resetModules();
    setupSidebarDom();
  });

  afterEach(async () => {
    // Restore the biometric mocks to their file-wide defaults so enrolled=true does
    // not leak into other tests.
    const { isBiometricEnrolled, unlockWithBiometric } = await import("../crypto/biometric");
    vi.mocked(isBiometricEnrolled).mockResolvedValue(false);
    vi.mocked(unlockWithBiometric).mockReset();
  });

  test("a biometric unlock also re-encrypts a legacy v1 vault to v3 (Argon2id)", async () => {
    const browser = (await import("webextension-polyfill")).default;
    const localSet = vi.mocked(browser.storage.local.set);
    vi.mocked(browser.storage.session.set).mockResolvedValue();
    localSet.mockResolvedValue();

    // Enrolled authenticator that returns the master, plus the unlock button the
    // shared DOM omits (it sits outside the vault form).
    const { isBiometricEnrolled, unlockWithBiometric } = await import("../crypto/biometric");
    vi.mocked(isBiometricEnrolled).mockResolvedValue(true);
    vi.mocked(unlockWithBiometric).mockReturnValue(okAsync(MASTER));
    const bioBtn = document.createElement("button");
    bioBtn.id = "biometric-unlock-btn";
    document.body.appendChild(bioBtn);

    await configureSnapshot(await makeLegacyLockedSnapshot());
    const before = localSet.mock.calls.length;
    await loadController();
    bioBtn.click();

    const written = await waitForVaultWrittenWithMaster(localSet, MASTER, before);
    expect(written.version).toBe(3);
    if (written.version === 3) {
      expect(written.memorySize).toBe(19 * 1024);
      expect(written.passes).toBe(2);
      expect(written.parallelism).toBe(1);
    }
    expect(unwrap(await decryptVault(written, MASTER))).toEqual({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      totpSecret: TEST_TOTP,
    });
  });
});
