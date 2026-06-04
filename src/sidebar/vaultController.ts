import browser from "webextension-polyfill";
import { Result, err, ok } from "neverthrow";
import {
  VAULT_STORAGE_KEY,
  encryptVault,
  decryptVault,
  type StoredVault,
  type VaultPayload,
} from "../crypto/vault";
import { clearResumeSnapshotSession } from "../onboarding/resumeSession";
import { isLogoutCunySessionsAck, type LogoutCunySessionsRequest } from "../onboarding/messages";
import { loadVaultSessionSnapshot } from "../vaultSession/snapshot";
import { LOGIN_EMAIL_SUFFIX, SESSION_MASTER_KEY } from "../cuny/ssoSite";
import {
  EXT_PASSWORD_MUST_DIFFER_FROM_CUNY_MSG,
  HIDE_PASSWORD_LABEL,
  MIN_MASTER_PASSWORD_LENGTH,
  SHOW_PASSWORD_LABEL,
  type SidebarDom,
  validateEmail,
  decryptStatusMessage,
  setStatus,
  hideTotpSecretSourceHint,
  clearPendingTotpFromSession,
  effectiveTotpSecretForSave,
  groupSecretForDisplay,
} from "./sidebar.utils";
export type { SidebarDom } from "./sidebar.utils";

const warnSessionStorageError = (context: string, error: unknown): void => {
  if (import.meta.env.MODE !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[CUNYAutoLogin] sidebar: ${context}`, error);
  }
};

/** Write master password to session storage if available (Chrome 114+, Firefox 115+ — matches `src/manifest.json`). */
async function saveSessionMaster(masterPassword: string): Promise<void> {
  try {
    await browser.storage.session?.set({ [SESSION_MASTER_KEY]: masterPassword });
  } catch (error) {
    warnSessionStorageError("saveSessionMaster failed", error);
  }
}

/** Drop session master on lock/reset so plaintext never lingers in `storage.session`. */
async function clearSessionMaster(): Promise<void> {
  try {
    await browser.storage.session?.remove(SESSION_MASTER_KEY);
  } catch (error) {
    warnSessionStorageError("clearSessionMaster failed", error);
  }
}

function setupPasswordToggles(): void {
  document.querySelectorAll<HTMLButtonElement>(".toggle-visibility").forEach((toggleBtn) => {
    const input = toggleBtn.previousElementSibling;
    if (!(input instanceof HTMLInputElement)) return;
    // Icon is driven by the `.is-showing` class (CSS mask in sidebar.css); no
    // markup is injected here, so there is no innerHTML write to flag.
    toggleBtn.setAttribute("aria-label", SHOW_PASSWORD_LABEL);
    toggleBtn.addEventListener("click", () => {
      const wasShowing = input.type === "text";
      input.type = wasShowing ? "password" : "text";
      toggleBtn.classList.toggle("is-showing", !wasShowing);
      toggleBtn.setAttribute("aria-label", wasShowing ? SHOW_PASSWORD_LABEL : HIDE_PASSWORD_LABEL);
    });
  });
}

/** How long the Copy button shows its "Copied" confirmation before resetting. */
const COPY_FEEDBACK_MS = 1600;

interface AdvancedRevealEls {
  toggle: HTMLButtonElement;
  body: HTMLElement;
  showBtn: HTMLButtonElement;
  secretBlock: HTMLElement;
  secretValue: HTMLElement;
  copyBtn: HTMLButtonElement;
  hideBtn: HTMLButtonElement;
}

/** Resolve the Advanced secret-key reveal elements; null when the markup is
 *  absent (non-management contexts and most unit-test fixtures). */
function getAdvancedRevealEls(): AdvancedRevealEls | null {
  const toggle = document.getElementById("advanced-toggle");
  const body = document.getElementById("advanced-body");
  const showBtn = document.getElementById("show-secret-btn");
  const secretBlock = document.getElementById("secret-block");
  const secretValue = document.getElementById("secret-value");
  const copyBtn = document.getElementById("copy-secret-btn");
  const hideBtn = document.getElementById("hide-secret-btn");
  if (
    toggle instanceof HTMLButtonElement &&
    body instanceof HTMLElement &&
    showBtn instanceof HTMLButtonElement &&
    secretBlock instanceof HTMLElement &&
    secretValue instanceof HTMLElement &&
    copyBtn instanceof HTMLButtonElement &&
    hideBtn instanceof HTMLButtonElement
  ) {
    return { toggle, body, showBtn, secretBlock, secretValue, copyBtn, hideBtn };
  }
  return null;
}

/** Copy the raw (ungrouped) secret to the clipboard. Failures are non-fatal —
 *  the key is still visible for manual copy. */
async function copySecretToClipboard(rawSecret: string): Promise<void> {
  if (!rawSecret) return;
  try {
    await navigator.clipboard?.writeText(rawSecret);
  } catch (error) {
    if (import.meta.env.MODE !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[CUNYAutoLogin] sidebar: clipboard copy failed", error);
    }
  }
}

/**
 * Wire the Advanced secret-key reveal inside the Six-digit code card.
 * Friction is intentional: Advanced disclosure → caution → "Show secret key".
 * The display is grouped in 4s; Copy uses the raw secret. Reassigns
 * `resetAdvancedSecretReveal` so lock re-conceals before any re-unlock.
 */
function setupAdvancedSecretReveal(): void {
  const adv = getAdvancedRevealEls();
  if (!adv) return;

  const copyLabel = adv.copyBtn.querySelector("span");
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  const resetCopy = (): void => {
    adv.copyBtn.classList.remove("is-ok");
    if (copyLabel) copyLabel.textContent = "Copy";
    if (copyTimer !== null) clearTimeout(copyTimer);
    copyTimer = null;
  };
  const concealKey = (): void => {
    adv.secretBlock.hidden = true;
    adv.showBtn.hidden = false;
    resetCopy();
  };
  resetAdvancedSecretReveal = (): void => {
    adv.toggle.setAttribute("aria-expanded", "false");
    adv.body.hidden = true;
    concealKey();
  };

  adv.toggle.addEventListener("click", () => {
    const open = adv.toggle.getAttribute("aria-expanded") === "true";
    adv.toggle.setAttribute("aria-expanded", String(!open));
    adv.body.hidden = open;
    if (open) concealKey(); // collapsing re-conceals the key
  });
  adv.showBtn.addEventListener("click", () => {
    adv.secretValue.textContent = groupSecretForDisplay(sessionPayload?.totpSecret ?? "");
    adv.showBtn.hidden = true;
    adv.secretBlock.hidden = false;
  });
  adv.hideBtn.addEventListener("click", concealKey);
  adv.copyBtn.addEventListener("click", async () => {
    await copySecretToClipboard(sessionPayload?.totpSecret ?? "");
    adv.copyBtn.classList.add("is-ok");
    if (copyLabel) copyLabel.textContent = "Copied";
    if (copyTimer !== null) clearTimeout(copyTimer);
    copyTimer = setTimeout(resetCopy, COPY_FEEDBACK_MS);
  });
}

// In-memory session state — never written to storage
type Mode = "locked" | "unlocked";
let currentMode: Mode = "locked";
let sessionMasterPassword: string | null = null;
let sessionPayload: VaultPayload | null = null;
let storedVault: StoredVault | null = null;
let isBiometricAvailable = false;
/** Collapses the Advanced disclosure and re-conceals the secret key. Replaced
 *  with the real reset by setupAdvancedSecretReveal(); no-op until then. */
let resetAdvancedSecretReveal: () => void = () => {};

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
  const statusBar = document.getElementById("vault-status-bar");
  const totpCard = document.getElementById("vault-totp-card");
  const footer = document.getElementById("vault-footer");

  if (lockedHeader) lockedHeader.hidden = mode !== "locked";
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
  els.modeHint.textContent = isManagement
    ? "Change your CUNY login email or password below, then save."
    : "Edit any field and save. To change your extension password, fill the optional fields below.";
  els.submitBtn.textContent = "Save changes";
  if (els.emailLabel) els.emailLabel.textContent = "CUNY email";
  if (els.passwordLabel) els.passwordLabel.textContent = "CUNY password";

  if (payload) {
    els.email.value = payload.email;
    els.password.value = payload.password;
    els.totpSecret.value = payload.totpSecret;
  }
};

function renderMode(els: SidebarDom): void {
  const { credentialFields, masterPasswordField, changeMasterSection } = els;
  const bioBtn = document.getElementById("biometric-unlock-btn") as HTMLButtonElement | null;

  updateVaultHeaders(currentMode);

  if (currentMode === "locked") {
    credentialFields.classList.add("hidden");
    masterPasswordField.classList.remove("hidden");
    changeMasterSection.classList.add("hidden");
    els.lockBtn.classList.add("hidden");
    els.masterLabel.textContent = "Extension password";
    els.modeHint.hidden = true;
    els.modeHint.textContent = "";
    els.submitBtn.textContent = "Unlock";
    if (bioBtn) bioBtn.hidden = !isBiometricAvailable;
  } else {
    if (bioBtn) bioBtn.hidden = true;
    renderUnlockedMode(els, isSidebarVaultManagement(), sessionPayload);
  }
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
    const cunyPassword = els.password.value;
    if (newMaster === cunyPassword) {
      return err(EXT_PASSWORD_MUST_DIFFER_FROM_CUNY_MSG);
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
  sessionPayload = { email, password, totpSecret };
  const previousSessionMaster = sessionMasterPassword;
  sessionMasterPassword = masterPasswordToUse;
  await saveSessionMaster(masterPasswordToUse);
  if (
    previousSessionMaster !== null &&
    masterPasswordToUse !== previousSessionMaster
  ) {
    // Stale biometric credential would decrypt to old password — clear it so
    // the unlock button disappears until the user re-enrolls.
    const { clearBiometricCredential } = await import("../crypto/biometric");
    await clearBiometricCredential();
    const bioBtn = document.getElementById("biometric-unlock-btn");
    if (bioBtn) bioBtn.hidden = true;
    isBiometricAvailable = false;
  }
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
  resetAdvancedSecretReveal();
  currentMode = "locked";
  setStatus("");
  renderMode(els);
}

async function resetToFreshInstall(): Promise<void> {
  try {
    await browser.storage.local.remove(VAULT_STORAGE_KEY);
  } catch {
    setStatus("Could not remove vault from storage.");
    return;
  }
  await clearResumeSnapshotSession();
  await clearSessionMaster();
  await clearPendingTotpFromSession();
  window.location.reload();
}

async function maybeWireBiometricUnlock(els: SidebarDom): Promise<void> {
  const bioBtn = document.getElementById("biometric-unlock-btn") as HTMLButtonElement | null;
  if (!bioBtn) return;

  const { isBiometricEnrolled, unlockWithBiometric } = await import("../crypto/biometric");
  if (!(await isBiometricEnrolled())) return;

  isBiometricAvailable = true;
  // renderMode already ran at init — show the button now if still in locked mode.
  if (currentMode === "locked") bioBtn.hidden = false;
  bioBtn.addEventListener("click", async () => {
    if (currentMode !== "locked" || !storedVault) return;
    bioBtn.disabled = true;
    setStatus("");

    const masterResult = await unlockWithBiometric();
    if (masterResult.isErr()) {
      const msg =
        masterResult.error === "user_cancelled"
          ? "Cancelled — enter your extension password."
          : "Biometric failed — enter your extension password.";
      setStatus(msg);
      bioBtn.disabled = false;
      return;
    }

    const decResult = await decryptVault(storedVault, masterResult.value);
    if (decResult.isErr()) {
      setStatus("Biometric out of sync — enter your extension password.");
      bioBtn.disabled = false;
      return;
    }

    sessionPayload = decResult.value;
    sessionMasterPassword = masterResult.value;
    await saveSessionMaster(masterResult.value);
    currentMode = "unlocked";
    setStatus("");
    renderMode(els);
    bioBtn.disabled = false;
  });
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
    onClearVault: () => void resetToFreshInstall(),
    onClearLiveSessions: async () => {
      const message: LogoutCunySessionsRequest = { type: "LOGOUT_CUNY_SESSIONS" };
      try {
        const response = await browser.runtime.sendMessage(message);
        return isLogoutCunySessionsAck(response) && response.ok;
      } catch (error) {
        if (import.meta.env.MODE !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[CUNYAutoLogin] logout sessions request failed", error);
        }
        return false;
      }
    },
  });
}

async function init(): Promise<void> {
  const elsResult = getEls();
  if (elsResult.isErr()) {
    if (import.meta.env.MODE !== "production") {
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
  // vaultController only mounts when a vault exists; snap.mode is never "setup" here.
  currentMode = snap.mode === "unlocked" ? "unlocked" : "locked";

  renderMode(els);
  setupPasswordToggles();
  setupAdvancedSecretReveal();

  els.totpSecret.addEventListener("input", () => hideTotpSecretSourceHint(els));

  els.form.addEventListener("submit", async (submitEvent: SubmitEvent) => {
    submitEvent.preventDefault();
    setStatus("");

    if (currentMode === "locked") {
      await handleLocked(els);
    } else {
      await handleUnlocked(els);
    }
  });

  els.lockBtn.addEventListener("click", () => void handleLock(els));

  await maybeWireBiometricUnlock(els);

  await maybeMountDevDebugPanel(els);
}

void init().catch((error) => {
  if (import.meta.env.MODE !== "production") {
    // eslint-disable-next-line no-console
    console.error("[CUNYAutoLogin] sidebar init failed", error);
  }
});
