import browser from "webextension-polyfill";
import {
  VAULT_STORAGE_KEY,
  encryptVault,
  decryptVault,
  isStoredVault,
  type StoredVault,
  type VaultPayload,
} from "../crypto/vault";

const REQUIRED_EMAIL_SUFFIX = "@login.cuny.edu";

// In-memory session state — never written to storage
type Mode = "setup" | "locked" | "unlocked";
let currentMode: Mode = "setup";
let sessionMasterPassword: string | null = null;
let sessionPayload: VaultPayload | null = null;
let storedVault: StoredVault | null = null;

function setStatus(message: string, ok = false): void {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("ok", ok);
}

function validateEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(REQUIRED_EMAIL_SUFFIX);
}

async function loadStoredVault(): Promise<StoredVault | null> {
  const result = await browser.storage.local.get(VAULT_STORAGE_KEY);
  const raw = result[VAULT_STORAGE_KEY];
  if (raw === undefined || raw === null) return null;
  if (!isStoredVault(raw)) return null;
  return raw;
}

function getEls() {
  const form = document.getElementById("vault-form");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const totpSecret = document.getElementById("totpSecret");
  const masterPassword = document.getElementById("masterPassword");
  const masterLabel = document.getElementById("master-label");
  const newMasterPassword = document.getElementById("newMasterPassword");
  const confirmNewMasterPassword = document.getElementById(
    "confirmNewMasterPassword"
  );
  const submitBtn = document.getElementById("submit-btn");
  const modeHint = document.getElementById("mode-hint");
  const credentialFields = document.getElementById("credential-fields");
  const masterPasswordField = document.getElementById("master-password-field");
  const changeMasterSection = document.getElementById("change-master-section");

  if (
    !(form instanceof HTMLFormElement) ||
    !(email instanceof HTMLInputElement) ||
    !(password instanceof HTMLInputElement) ||
    !(totpSecret instanceof HTMLInputElement) ||
    !(masterPassword instanceof HTMLInputElement) ||
    !(masterLabel instanceof HTMLElement) ||
    !(newMasterPassword instanceof HTMLInputElement) ||
    !(confirmNewMasterPassword instanceof HTMLInputElement) ||
    !(submitBtn instanceof HTMLButtonElement) ||
    !(modeHint instanceof HTMLElement) ||
    !(credentialFields instanceof HTMLElement) ||
    !(masterPasswordField instanceof HTMLElement) ||
    !(changeMasterSection instanceof HTMLElement)
  ) {
    throw new Error("Missing required DOM elements");
  }

  return {
    form,
    email,
    password,
    totpSecret,
    masterPassword,
    masterLabel,
    newMasterPassword,
    confirmNewMasterPassword,
    submitBtn,
    modeHint,
    credentialFields,
    masterPasswordField,
    changeMasterSection,
  };
}

function renderMode(els: ReturnType<typeof getEls>): void {
  const { credentialFields, masterPasswordField, changeMasterSection } = els;

  if (currentMode === "setup") {
    credentialFields.classList.remove("hidden");
    masterPasswordField.classList.remove("hidden");
    changeMasterSection.classList.add("hidden");
    els.masterLabel.textContent = "Extension master password";
    els.modeHint.textContent =
      "First-time setup: enter your CUNY login email, password, TOTP secret (Base32), and a strong master password. The master password is never stored.";
    els.submitBtn.textContent = "Save encrypted vault";
  } else if (currentMode === "locked") {
    credentialFields.classList.add("hidden");
    masterPasswordField.classList.remove("hidden");
    changeMasterSection.classList.add("hidden");
    els.masterLabel.textContent = "Master password to unlock";
    els.modeHint.textContent =
      "Credentials are saved. Enter your master password to unlock and view them.";
    els.submitBtn.textContent = "Unlock";
  } else {
    // unlocked
    credentialFields.classList.remove("hidden");
    masterPasswordField.classList.add("hidden");
    changeMasterSection.classList.remove("hidden");
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

async function handleSetup(els: ReturnType<typeof getEls>): Promise<void> {
  const email = els.email.value.trim();
  const password = els.password.value;
  const totpSecret = els.totpSecret.value.trim().replace(/\s+/g, "");
  const masterPassword = els.masterPassword.value;

  if (!validateEmail(email)) {
    setStatus(`Email must end with ${REQUIRED_EMAIL_SUFFIX}`);
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
  if (masterPassword.length < 8) {
    setStatus("Master password must be at least 8 characters.");
    return;
  }

  els.submitBtn.disabled = true;
  try {
    const newVault = await encryptVault({ email, password, totpSecret }, masterPassword);
    await browser.storage.local.set({ [VAULT_STORAGE_KEY]: newVault });
    storedVault = newVault;
    els.masterPassword.value = "";
    setStatus("Saved. Secrets are encrypted locally.", true);
  } catch {
    setStatus("Save failed. Try again.");
  } finally {
    els.submitBtn.disabled = false;
  }
}

async function handleLocked(els: ReturnType<typeof getEls>): Promise<void> {
  if (!storedVault) return;

  const masterPassword = els.masterPassword.value;
  if (!masterPassword.length) {
    setStatus("Enter your master password to unlock.");
    return;
  }

  els.submitBtn.disabled = true;
  try {
    const payload = await decryptVault(storedVault, masterPassword);
    // Store in session memory, clear from DOM immediately
    sessionPayload = payload;
    sessionMasterPassword = masterPassword;
    els.masterPassword.value = "";
    currentMode = "unlocked";
    setStatus("");
    renderMode(els);
  } catch (err) {
    const msg =
      err instanceof Error && err.message === "DECRYPT_FAILED"
        ? "Wrong master password or corrupted vault."
        : "Could not decrypt vault.";
    setStatus(msg);
  } finally {
    els.submitBtn.disabled = false;
  }
}

async function handleUnlocked(els: ReturnType<typeof getEls>): Promise<void> {
  const email = els.email.value.trim();
  const password = els.password.value;
  const totpSecret = els.totpSecret.value.trim().replace(/\s+/g, "");
  const newMaster = els.newMasterPassword.value;
  const confirmMaster = els.confirmNewMasterPassword.value;

  if (!validateEmail(email)) {
    setStatus(`Email must end with ${REQUIRED_EMAIL_SUFFIX}`);
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
    if (newMaster.length < 8) {
      setStatus("New master password must be at least 8 characters.");
      return;
    }
    masterPasswordToUse = newMaster;
  } else {
    setStatus("Fill both new master password fields, or leave both empty.");
    return;
  }

  els.submitBtn.disabled = true;
  try {
    const newVault = await encryptVault(
      { email, password, totpSecret },
      masterPasswordToUse
    );
    await browser.storage.local.set({ [VAULT_STORAGE_KEY]: newVault });
    storedVault = newVault;
    // Update session state with any changes
    sessionPayload = { email, password, totpSecret };
    sessionMasterPassword = masterPasswordToUse;
    // Clear optional new master password fields
    els.newMasterPassword.value = "";
    els.confirmNewMasterPassword.value = "";
    setStatus("Changes saved. Secrets are encrypted locally.", true);
  } catch {
    setStatus("Save failed. Try again.");
  } finally {
    els.submitBtn.disabled = false;
  }
}

async function init(): Promise<void> {
  const els = getEls();
  storedVault = await loadStoredVault();

  currentMode = storedVault ? "locked" : "setup";
  renderMode(els);

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

  const testBtn = document.getElementById("test-message-btn");
  if (testBtn instanceof HTMLButtonElement) {
    testBtn.addEventListener("click", async () => {
      try {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tabId = tabs[0]?.id;
        if (tabId === undefined) {
          setStatus("No active tab.");
          return;
        }
        await browser.tabs.sendMessage(tabId, {
          type: "FILL_CREDENTIALS",
          payload: { demo: true },
        });
        setStatus("Sent FILL_CREDENTIALS to active tab.", true);
      } catch {
        setStatus(
          "Could not send message (open ssologin.cuny.edu in the active tab?)."
        );
      }
    });
  }
}

void init();
