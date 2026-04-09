import browser from "webextension-polyfill";
import { Result, err, ok } from "neverthrow";
import {
  VAULT_STORAGE_KEY,
  encryptVault,
  decryptVault,
  isStoredVault,
  type StoredVault,
  type VaultPayload,
} from "../crypto/vault";
import { LOGIN_EMAIL_SUFFIX, PENDING_TOTP_SECRET_SESSION_KEY, SESSION_MASTER_KEY } from "../cuny/ssoSite";
import {
  DRAFT_KEY,
  MIN_MASTER_PASSWORD_LENGTH,
  type FormDraft,
  type PopupDom,
  validateEmail,
  decryptStatusMessage,
  coerceDraft,
  setStatus,
  hideTotpSecretSourceHint,
  saveDraft,
  clearDraft,
  clearPendingTotpFromSession,
  applyPendingTotpFromPage,
} from "./popup.utils";
export type { PopupDom } from "./popup.utils";

const EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

/** Write master password to session storage if available (Chrome 102+, Firefox 115+). */
async function saveSessionMaster(masterPassword: string): Promise<void> {
  try {
    await browser.storage.session?.set({ [SESSION_MASTER_KEY]: masterPassword });
  } catch {
    // session storage not available — silently degrade
  }
}

/** Read master password from session storage. Returns null if unavailable or not set. */
async function loadSessionMaster(): Promise<string | null> {
  try {
    const result = await browser.storage.session?.get(SESSION_MASTER_KEY);
    const val = result?.[SESSION_MASTER_KEY];
    return typeof val === "string" ? val : null;
  } catch {
    return null;
  }
}

/** Clear master password from session storage. */
async function clearSessionMaster(): Promise<void> {
  try {
    await browser.storage.session?.remove(SESSION_MASTER_KEY);
  } catch {
    // silently degrade
  }
}

function applyDraft(els: PopupDom, draft: FormDraft): void {
  if (draft.email) els.email.value = draft.email;
  if (draft.password) els.password.value = draft.password;
  if (draft.totpSecret) els.totpSecret.value = draft.totpSecret;
}

async function restoreDraft(els: PopupDom): Promise<void> {
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


async function loadStoredVault(): Promise<StoredVault | null> {
  const result = await browser.storage.local.get(VAULT_STORAGE_KEY);
  const raw = result[VAULT_STORAGE_KEY];
  if (raw === undefined || raw === null) return null;
  if (!isStoredVault(raw)) return null;
  return raw;
}

function getEls(): Result<PopupDom, "missing_dom"> {
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
  });
}


function renderMode(els: PopupDom): void {
  const { credentialFields, masterPasswordField, changeMasterSection } = els;

  if (currentMode === "setup") {
    credentialFields.classList.remove("hidden");
    masterPasswordField.classList.remove("hidden");
    changeMasterSection.classList.add("hidden");
    els.lockBtn.classList.add("hidden");
    els.masterLabel.textContent = "Extension master password";
    els.modeHint.textContent =
      "First-time setup: enter your CUNY login email, password, TOTP secret (Base32), and a strong master password. The master password is never stored.";
    els.submitBtn.textContent = "Save encrypted vault";
  } else if (currentMode === "locked") {
    credentialFields.classList.add("hidden");
    masterPasswordField.classList.remove("hidden");
    changeMasterSection.classList.add("hidden");
    els.lockBtn.classList.add("hidden");
    els.masterLabel.textContent = "Master password to unlock";
    els.modeHint.textContent =
      "Credentials are saved. Enter your master password to unlock and view them.";
    els.submitBtn.textContent = "Unlock";
  } else {
    // unlocked
    credentialFields.classList.remove("hidden");
    masterPasswordField.classList.add("hidden");
    changeMasterSection.classList.remove("hidden");
    els.lockBtn.classList.remove("hidden");
    els.masterLabel.textContent = "Extension master password";
    els.modeHint.textContent =
      "Your credentials are unlocked. Edit any field and save. To change your master password, fill the optional fields below.";
    els.submitBtn.textContent = "Save changes";

    // Pre-fill credential fields from session
    if (sessionPayload) {
      els.email.value = sessionPayload.email;
      els.password.value = sessionPayload.password;
      els.totpSecret.value = sessionPayload.totpSecret;
    }
  }
}

async function handleSetup(els: PopupDom): Promise<void> {
  const email = els.email.value.trim();
  const password = els.password.value;
  const totpSecret = els.totpSecret.value.trim().replace(/\s+/g, "");
  const masterPassword = els.masterPassword.value;

  if (!validateEmail(email)) {
    setStatus(`Email must end with ${LOGIN_EMAIL_SUFFIX}`);
    return;
  }
  if (!password.length) {
    setStatus("Password is required.");
    return;
  }
  if (!totpSecret.length) {
    setStatus("TOTP secret is required.");
    return;
  }
  if (masterPassword.length < MIN_MASTER_PASSWORD_LENGTH) {
    setStatus(`Master password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`);
    return;
  }

  els.submitBtn.disabled = true;
  const encResult = await encryptVault({ email, password, totpSecret }, masterPassword);
  if (encResult.isErr()) {
    setStatus("Save failed. Try again.");
    els.submitBtn.disabled = false;
    return;
  }
  const newVault = encResult.value;
  await browser.storage.local.set({ [VAULT_STORAGE_KEY]: newVault });
  storedVault = newVault;
  sessionPayload = { email, password, totpSecret };
  sessionMasterPassword = masterPassword;
  await saveSessionMaster(masterPassword);
  await clearDraft();
  hideTotpSecretSourceHint(els);
  els.masterPassword.value = "";
  currentMode = "unlocked";
  renderMode(els);
  setStatus("Saved. Secrets are encrypted locally.", true);
  els.submitBtn.disabled = false;
}

async function handleLocked(els: PopupDom): Promise<void> {
  if (!storedVault) return;

  const masterPassword = els.masterPassword.value;
  if (!masterPassword.length) {
    setStatus("Enter your master password to unlock.");
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

async function handleUnlocked(els: PopupDom): Promise<void> {
  const email = els.email.value.trim();
  const password = els.password.value;
  const totpSecret = els.totpSecret.value.trim().replace(/\s+/g, "");
  const newMaster = els.newMasterPassword.value;
  const confirmMaster = els.confirmNewMasterPassword.value;

  if (!validateEmail(email)) {
    setStatus(`Email must end with ${LOGIN_EMAIL_SUFFIX}`);
    return;
  }
  if (!password.length) {
    setStatus("Password is required.");
    return;
  }
  if (!totpSecret.length) {
    setStatus("TOTP secret is required.");
    return;
  }

  // Determine which master password to use for re-encryption
  let masterPasswordToUse: string;
  if (newMaster.length === 0 && confirmMaster.length === 0) {
    // Keep current master password (from session memory)
    if (!sessionMasterPassword) {
      setStatus("Session expired. Please close and reopen the extension.");
      return;
    }
    masterPasswordToUse = sessionMasterPassword;
  } else if (newMaster.length > 0 && confirmMaster.length > 0) {
    if (newMaster !== confirmMaster) {
      setStatus("New master passwords do not match.");
      return;
    }
    if (newMaster.length < MIN_MASTER_PASSWORD_LENGTH) {
      setStatus(`New master password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`);
      return;
    }
    masterPasswordToUse = newMaster;
  } else {
    setStatus("Fill both new master password fields, or leave both empty.");
    return;
  }

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

async function handleLock(els: PopupDom): Promise<void> {
  sessionMasterPassword = null;
  sessionPayload = null;
  await clearSessionMaster();
  await clearPendingTotpFromSession();
  hideTotpSecretSourceHint(els);
  currentMode = "locked";
  setStatus("");
  renderMode(els);
}

async function resetToFreshInstall(els: PopupDom): Promise<void> {
  try {
    await browser.storage.local.remove(VAULT_STORAGE_KEY);
  } catch {
    setStatus("Could not remove vault from storage.");
    return;
  }
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

async function init(): Promise<void> {
  const elsResult = getEls();
  if (elsResult.isErr()) {
    console.error("[CUNYAutoLogin] popup DOM incomplete");
    return;
  }
  const els = elsResult.value;
  storedVault = await loadStoredVault();

  if (!storedVault) {
    currentMode = "setup";
  } else {
    const savedMaster = await loadSessionMaster();
    if (savedMaster) {
      const decResult = await decryptVault(storedVault, savedMaster);
      if (decResult.isOk()) {
        sessionPayload = decResult.value;
        sessionMasterPassword = savedMaster;
        currentMode = "unlocked";
      } else {
        await clearSessionMaster();
        currentMode = "locked";
      }
    } else {
      currentMode = "locked";
    }
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
    } catch {
      // listener registration failed
    }
  }

  [els.email, els.password, els.totpSecret].forEach((input) => {
    input.addEventListener("input", () => {
      if (currentMode !== "setup") return;
      void saveDraft(els);
    });
  });

  els.totpSecret.addEventListener("input", () => hideTotpSecretSourceHint(els));

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
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

  if (import.meta.env.MODE === "development") {
    const { mountDebugPanel } = await import("./debugPanel");
    mountDebugPanel({
      els,
      setStatus,
      getSessionPayload: () => sessionPayload,
      onClearVault: () => void resetToFreshInstall(els),
    });
  }
}

void init();
