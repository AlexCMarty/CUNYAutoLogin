import browser from "webextension-polyfill";
import { Result, err, ok } from "neverthrow";
import {
  VAULT_STORAGE_KEY,
  encryptVault,
  decryptVault,
  type StoredVault,
  type VaultPayload,
} from "../crypto/vault";
import { clearOnboardingComplete } from "../onboarding/onboardingComplete";
import { clearResumeSnapshotSession } from "../onboarding/resumeSession";
import type { LogoutCunySessionsAck, LogoutCunySessionsRequest } from "../onboarding/messages";
import { loadVaultSessionSnapshot } from "../vaultSession/snapshot";
import { LOGIN_EMAIL_SUFFIX, PENDING_TOTP_SECRET_SESSION_KEY, SESSION_MASTER_KEY } from "../cuny/ssoSite";
import {
  DRAFT_KEY,
  MIN_MASTER_PASSWORD_LENGTH,
  type FormDraft,
  type SidebarDom,
  validateEmail,
  decryptStatusMessage,
  coerceDraft,
  setStatus,
  hideTotpSecretSourceHint,
  saveDraft,
  clearDraft,
  clearPendingTotpFromSession,
  applyPendingTotpFromPage,
  effectiveTotpSecretForSave,
} from "./sidebar.utils";
export type { SidebarDom } from "./sidebar.utils";

const EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

/** Write master password to session storage if available (Chrome 114+, Firefox 115+ — matches `src/manifest.json`). */
async function saveSessionMaster(masterPassword: string): Promise<void> {
  try {
    await browser.storage.session?.set({ [SESSION_MASTER_KEY]: masterPassword });
  } catch {
    // session storage not available — silently degrade
  }
}

/** Drop session master on lock/reset so plaintext never lingers in `storage.session`. */
async function clearSessionMaster(): Promise<void> {
  try {
    await browser.storage.session?.remove(SESSION_MASTER_KEY);
  } catch {
    // silently degrade
  }
}

function applyDraft(els: SidebarDom, draft: FormDraft): void {
  if (draft.email) els.email.value = draft.email;
  if (draft.password) els.password.value = draft.password;
  if (draft.totpSecret) els.totpSecret.value = draft.totpSecret;
}

async function restoreDraft(els: SidebarDom): Promise<void> {
  try {
    const result = await browser.storage.session?.get(DRAFT_KEY);
    const raw = result?.[DRAFT_KEY];
    if (raw === undefined || raw === null) return;
    const draft = coerceDraft(raw);
    if (!draft) {
      await browser.storage.session?.remove(DRAFT_KEY);
      return;
    }
    applyDraft(els, draft);
  } catch {
    // session storage unavailable — proceed without draft
  }
}

function setupPasswordToggles(): void {
  document.querySelectorAll<HTMLButtonElement>(".toggle-visibility").forEach((btn) => {
    const input = btn.previousElementSibling;
    if (!(input instanceof HTMLInputElement)) return;
    const baseLabel = btn.getAttribute("aria-label") ?? "Show password";
    btn.innerHTML = EYE_CLOSED;
    btn.setAttribute("aria-label", baseLabel);
    btn.addEventListener("click", () => {
      const nowShowing = input.type === "text";
      input.type = nowShowing ? "password" : "text";
      btn.innerHTML = nowShowing ? EYE_CLOSED : EYE_OPEN;
      btn.setAttribute("aria-label", nowShowing ? baseLabel : baseLabel.replace("Show", "Hide"));
    });
  });
}

// In-memory session state — never written to storage
type Mode = "setup" | "locked" | "unlocked";
let currentMode: Mode = "setup";
let sessionMasterPassword: string | null = null;
let sessionPayload: VaultPayload | null = null;
let storedVault: StoredVault | null = null;

const isSidebarVaultManagement = (): boolean =>
  document.body.dataset.vaultUi === "sidebar-management";

function getEls(): Result<SidebarDom, "missing_dom"> {
  const form = document.getElementById("vault-form");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const totpSecret = document.getElementById("totpSecret");
  const totpSecretSourceHint = document.getElementById("totp-secret-source-hint");
  const masterPassword = document.getElementById("masterPassword");
  const masterLabel = document.getElementById("master-label");
  const newMasterPassword = document.getElementById("newMasterPassword");
  const confirmNewMasterPassword = document.getElementById(
    "confirmNewMasterPassword"
  );
  const submitBtn = document.getElementById("submit-btn");
  const lockBtn = document.getElementById("lock-btn");
  const modeHint = document.getElementById("mode-hint");
  const credentialFields = document.getElementById("credential-fields");
  const masterPasswordField = document.getElementById("master-password-field");
  const changeMasterSection = document.getElementById("change-master-section");
  const emailLabel = document.getElementById("vault-email-label");
  const passwordLabel = document.getElementById("vault-password-label");

  if (
    !(form instanceof HTMLFormElement) ||
    !(email instanceof HTMLInputElement) ||
    !(password instanceof HTMLInputElement) ||
    !(totpSecret instanceof HTMLInputElement) ||
    !(totpSecretSourceHint instanceof HTMLElement) ||
    !(masterPassword instanceof HTMLInputElement) ||
    !(masterLabel instanceof HTMLElement) ||
    !(newMasterPassword instanceof HTMLInputElement) ||
    !(confirmNewMasterPassword instanceof HTMLInputElement) ||
    !(submitBtn instanceof HTMLButtonElement) ||
    !(lockBtn instanceof HTMLButtonElement) ||
    !(modeHint instanceof HTMLElement) ||
    !(credentialFields instanceof HTMLElement) ||
    !(masterPasswordField instanceof HTMLElement) ||
    !(changeMasterSection instanceof HTMLElement)
  ) {
    return err("missing_dom");
  }

  return ok({
    form,
    email,
    password,
    totpSecret,
    totpSecretSourceHint,
    masterPassword,
    masterLabel,
    newMasterPassword,
    confirmNewMasterPassword,
    submitBtn,
    lockBtn,
    modeHint,
    credentialFields,
    masterPasswordField,
    changeMasterSection,
    emailLabel,
    passwordLabel,
  });
}


/** Show/hide the new design-system vault header panels using the `hidden` attribute. */
const updateVaultHeaders = (mode: Mode): void => {
  const lockedHeader = document.getElementById("vault-locked-header");
  const setupHeader = document.getElementById("vault-setup-header");
  const statusBar = document.getElementById("vault-status-bar");
  const totpCard = document.getElementById("vault-totp-card");
  const footer = document.getElementById("vault-footer");

  if (lockedHeader) lockedHeader.hidden = mode !== "locked";
  if (setupHeader) setupHeader.hidden = mode !== "setup";
  if (statusBar) statusBar.hidden = mode !== "unlocked";
  if (totpCard) totpCard.hidden = mode !== "unlocked" || !isSidebarVaultManagement();
  if (footer) footer.hidden = mode !== "locked";
};

const renderUnlockedMode = (
  els: SidebarDom,
  isManagement: boolean,
  payload: VaultPayload | null
): void => {
  els.credentialFields.classList.remove("hidden");
  els.masterPasswordField.classList.add("hidden");
  els.changeMasterSection.classList.remove("hidden");
  els.lockBtn.classList.remove("hidden");
  els.masterLabel.textContent = "Extension password";
  els.modeHint.hidden = false;
  if (isManagement) {
    els.modeHint.textContent =
      "Change your CUNY login email or password below, then save.";
    els.submitBtn.textContent = "Save changes";
    if (els.emailLabel) els.emailLabel.textContent = "CUNY email";
    if (els.passwordLabel) els.passwordLabel.textContent = "CUNY password";
  } else {
    els.modeHint.textContent =
      "Edit any field and save. To change your extension password, fill the optional fields below.";
    els.submitBtn.textContent = "Save changes";
    if (els.emailLabel) els.emailLabel.textContent = "CUNY email";
    if (els.passwordLabel) els.passwordLabel.textContent = "CUNY password";
  }

  if (payload) {
    els.email.value = payload.email;
    els.password.value = payload.password;
    els.totpSecret.value = payload.totpSecret;
  }
};

function renderMode(els: SidebarDom): void {
  const { credentialFields, masterPasswordField, changeMasterSection } = els;

  updateVaultHeaders(currentMode);

  if (currentMode === "setup") {
    credentialFields.classList.remove("hidden");
    masterPasswordField.classList.remove("hidden");
    changeMasterSection.classList.add("hidden");
    els.lockBtn.classList.add("hidden");
    els.masterLabel.textContent = "Extension password";
    els.modeHint.hidden = false;
    els.modeHint.textContent =
      "First-time setup: enter your CUNY login email, password, TOTP secret (Base32), and an extension password. The extension password is never stored.";
    els.submitBtn.textContent = "Save";
  } else if (currentMode === "locked") {
    credentialFields.classList.add("hidden");
    masterPasswordField.classList.remove("hidden");
    changeMasterSection.classList.add("hidden");
    els.lockBtn.classList.add("hidden");
    els.masterLabel.textContent = "Extension password";
    els.modeHint.hidden = true;
    els.modeHint.textContent = "";
    els.submitBtn.textContent = "Unlock";
  } else {
    renderUnlockedMode(els, isSidebarVaultManagement(), sessionPayload);
  }
}

/** Returns a user-visible error string, or null if the setup form is valid. */
const validateSetupForm = (els: SidebarDom): string | null => {
  const email = els.email.value.trim();
  const password = els.password.value;
  const totpSecret = els.totpSecret.value.trim().replace(/\s+/g, "");
  const masterPassword = els.masterPassword.value;

  if (!validateEmail(email)) return `Email must end with ${LOGIN_EMAIL_SUFFIX}`;
  if (!password.length) return "Password is required.";
  if (!totpSecret.length) return "TOTP secret is required.";
  if (masterPassword.length < MIN_MASTER_PASSWORD_LENGTH) {
    return `Extension password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`;
  }
  return null;
};

/** First-time save: persist ciphertext, hydrate session, clear draft, leave no master in fields longer than needed. */
const commitNewVault = async (
  els: SidebarDom,
  email: string,
  password: string,
  totpSecret: string,
  master: string
): Promise<void> => {
  els.submitBtn.disabled = true;
  const encResult = await encryptVault({ email, password, totpSecret }, master);
  if (encResult.isErr()) {
    setStatus("Save failed. Try again.");
    els.submitBtn.disabled = false;
    return;
  }
  const newVault = encResult.value;
  await browser.storage.local.set({ [VAULT_STORAGE_KEY]: newVault });
  storedVault = newVault;
  sessionPayload = { email, password, totpSecret };
  sessionMasterPassword = master;
  await saveSessionMaster(master);
  await clearDraft();
  hideTotpSecretSourceHint(els);
  els.masterPassword.value = "";
  currentMode = "unlocked";
  renderMode(els);
  setStatus("Saved. Secrets are encrypted locally.", true);
  els.submitBtn.disabled = false;
};

async function handleSetup(els: SidebarDom): Promise<void> {
  const validationError = validateSetupForm(els);
  if (validationError) {
    setStatus(validationError);
    return;
  }

  const email = els.email.value.trim();
  const password = els.password.value;
  const totpSecret = els.totpSecret.value.trim().replace(/\s+/g, "");
  const masterPassword = els.masterPassword.value;
  await commitNewVault(els, email, password, totpSecret, masterPassword);
}

async function handleLocked(els: SidebarDom): Promise<void> {
  if (!storedVault) return;

  const masterPassword = els.masterPassword.value;
  if (!masterPassword.length) {
    setStatus("Enter your extension password to unlock.");
    return;
  }

  els.submitBtn.disabled = true;
  const decResult = await decryptVault(storedVault, masterPassword);
  if (decResult.isErr()) {
    setStatus(decryptStatusMessage(decResult.error));
    els.submitBtn.disabled = false;
    return;
  }
  const payload = decResult.value;
  sessionPayload = payload;
  sessionMasterPassword = masterPassword;
  await saveSessionMaster(masterPassword);
  els.masterPassword.value = "";
  currentMode = "unlocked";
  setStatus("");
  renderMode(els);
  els.submitBtn.disabled = false;
}

/**
 * Returns the master password to use for re-encryption, or an Err with a user-visible message.
 * When both new-master fields are empty, the existing session master is kept.
 * When both are filled, they must match and meet the minimum length.
 */
const resolveMasterPasswordForSave = (
  els: SidebarDom,
  currentSessionMaster: string | null
): Result<string, string> => {
  const newMaster = els.newMasterPassword.value;
  const confirmMaster = els.confirmNewMasterPassword.value;

  if (newMaster.length === 0 && confirmMaster.length === 0) {
    if (!currentSessionMaster) {
      return err("Session expired. Please close and reopen the extension.");
    }
    return ok(currentSessionMaster);
  }

  if (newMaster.length > 0 && confirmMaster.length > 0) {
    if (newMaster !== confirmMaster) return err("New extension passwords do not match.");
    if (newMaster.length < MIN_MASTER_PASSWORD_LENGTH) {
      return err(`New extension password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`);
    }
    return ok(newMaster);
  }

  return err("Fill both new extension password fields, or leave both empty.");
};

async function handleUnlocked(els: SidebarDom): Promise<void> {
  const email = els.email.value.trim();
  const password = els.password.value;
  const totpSecret = effectiveTotpSecretForSave(
    els.totpSecret.value,
    sessionPayload?.totpSecret,
    isSidebarVaultManagement()
  );

  if (!validateEmail(email)) {
    setStatus(`Email must end with ${LOGIN_EMAIL_SUFFIX}`);
    return;
  }
  if (!password.length) {
    setStatus("Password is required.");
    return;
  }
  if (!totpSecret.length) {
    setStatus(
      isSidebarVaultManagement()
        ? "Could not read your login code secret. Lock the vault and unlock again, then save."
        : "TOTP secret is required."
    );
    return;
  }

  const masterResult = resolveMasterPasswordForSave(els, sessionMasterPassword);
  if (masterResult.isErr()) {
    setStatus(masterResult.error);
    return;
  }
  const masterPasswordToUse = masterResult.value;

  els.submitBtn.disabled = true;
  const encResult = await encryptVault(
    { email, password, totpSecret },
    masterPasswordToUse
  );
  if (encResult.isErr()) {
    setStatus("Save failed. Try again.");
    els.submitBtn.disabled = false;
    return;
  }
  const newVault = encResult.value;
  await browser.storage.local.set({ [VAULT_STORAGE_KEY]: newVault });
  storedVault = newVault;
  await clearDraft();
  sessionPayload = { email, password, totpSecret };
  sessionMasterPassword = masterPasswordToUse;
  await saveSessionMaster(masterPasswordToUse);
  els.newMasterPassword.value = "";
  els.confirmNewMasterPassword.value = "";
  setStatus("Changes saved. Secrets are encrypted locally.", true);
  els.submitBtn.disabled = false;
}

async function handleLock(els: SidebarDom): Promise<void> {
  sessionMasterPassword = null;
  sessionPayload = null;
  await clearSessionMaster();
  await clearPendingTotpFromSession();
  hideTotpSecretSourceHint(els);
  currentMode = "locked";
  setStatus("");
  renderMode(els);
}

async function resetToFreshInstall(els: SidebarDom): Promise<void> {
  try {
    await browser.storage.local.remove(VAULT_STORAGE_KEY);
  } catch {
    setStatus("Could not remove vault from storage.");
    return;
  }
  await clearOnboardingComplete();
  await clearResumeSnapshotSession();
  delete document.body.dataset.vaultUi;
  await clearSessionMaster();
  await clearPendingTotpFromSession();
  await clearDraft();
  els.email.value = "";
  els.password.value = "";
  els.totpSecret.value = "";
  els.masterPassword.value = "";
  els.newMasterPassword.value = "";
  els.confirmNewMasterPassword.value = "";
  hideTotpSecretSourceHint(els);
  storedVault = null;
  sessionPayload = null;
  sessionMasterPassword = null;
  currentMode = "setup";
  renderMode(els);
  await applyPendingTotpFromPage(els);
  setStatus("Vault cleared. State matches a fresh install.", true);
}

async function maybeMountDevDebugPanel(els: SidebarDom): Promise<void> {
  if (import.meta.env.MODE !== "development") {
    return;
  }
  const { mountDebugPanel } = await import("./debugPanel");
  mountDebugPanel({
    els,
    setStatus,
    getSessionPayload: () => sessionPayload,
    onClearVault: () => void resetToFreshInstall(els),
    onClearLiveSessions: async () => {
      const message: LogoutCunySessionsRequest = { type: "LOGOUT_CUNY_SESSIONS" };
      try {
        const response = (await browser.runtime.sendMessage(message)) as
          | LogoutCunySessionsAck
          | undefined;
        return response?.ok === true;
      } catch {
        return false;
      }
    },
  });
}

async function init(): Promise<void> {
  const elsResult = getEls();
  if (elsResult.isErr()) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[CUNYAutoLogin] sidebar DOM incomplete");
    }
    return;
  }
  const els = elsResult.value;
  const snap = await loadVaultSessionSnapshot();
  storedVault = snap.storedVault;
  sessionMasterPassword = snap.sessionMasterPassword;
  sessionPayload = snap.sessionPayload;
  currentMode = snap.mode;

  if (currentMode === "setup") {
    delete document.body.dataset.vaultUi;
  }

  renderMode(els);
  setupPasswordToggles();

  if (currentMode === "setup") {
    await restoreDraft(els);
    await applyPendingTotpFromPage(els);
  }

  const sessionApi = browser.storage.session;
  if (sessionApi?.onChanged) {
    try {
      sessionApi.onChanged.addListener((changes) => {
        if (changes[PENDING_TOTP_SECRET_SESSION_KEY] === undefined) {
          return;
        }
        if (currentMode !== "setup") {
          return;
        }
        void applyPendingTotpFromPage(els);
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[CUNYAutoLogin] session.onChanged listener not registered", error);
      }
    }
  }

  [els.email, els.password, els.totpSecret].forEach((input) => {
    input.addEventListener("input", () => {
      if (currentMode !== "setup") return;
      void saveDraft(els);
    });
  });

  els.totpSecret.addEventListener("input", () => hideTotpSecretSourceHint(els));

  els.form.addEventListener("submit", async (submitEvent: SubmitEvent) => {
    submitEvent.preventDefault();
    setStatus("");

    if (currentMode === "setup") {
      await handleSetup(els);
    } else if (currentMode === "locked") {
      await handleLocked(els);
    } else {
      await handleUnlocked(els);
    }
  });

  els.lockBtn.addEventListener("click", () => void handleLock(els));

  await maybeMountDevDebugPanel(els);
}

void init().catch((error) => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error("[CUNYAutoLogin] sidebar init failed", error);
  }
});
