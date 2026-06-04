import browser from "webextension-polyfill";
import { LOGIN_EMAIL_SUFFIX, PENDING_TOTP_SECRET_SESSION_KEY } from "../cuny/ssoSite";
import type { VaultError } from "../crypto/vault";

/** Minimum character length enforced for the master password in both setup and change-master flows. */
export const MIN_MASTER_PASSWORD_LENGTH = 12;

/** Shown when the vault/extension password would equal the CUNY login password (sidebar + onboarding). */
export const EXT_PASSWORD_MUST_DIFFER_FROM_CUNY_MSG =
  "Choose a different password than your CUNY login password.";

export { HIDE_PASSWORD_LABEL, SHOW_PASSWORD_LABEL } from "./passwordToggleLabels";

export interface SidebarDom {
  form: HTMLFormElement;
  email: HTMLInputElement;
  password: HTMLInputElement;
  totpSecret: HTMLInputElement;
  totpSecretSourceHint: HTMLElement;
  masterPassword: HTMLInputElement;
  masterLabel: HTMLElement;
  newMasterPassword: HTMLInputElement;
  confirmNewMasterPassword: HTMLInputElement;
  submitBtn: HTMLButtonElement;
  lockBtn: HTMLButtonElement;
  modeHint: HTMLElement;
  credentialFields: HTMLElement;
  masterPasswordField: HTMLElement;
  changeMasterSection: HTMLElement;
  readonly emailLabel: HTMLElement | null;
  readonly passwordLabel: HTMLElement | null;
}

export const validateEmail = (email: string): boolean =>
  email.trim().toLowerCase().endsWith(LOGIN_EMAIL_SUFFIX);

export const decryptStatusMessage = (vaultError: VaultError): string =>
  vaultError === "decrypt_failed"
    ? "Wrong extension password or corrupted vault."
    : "Could not decrypt vault.";

export function setStatus(message: string, ok = false): void {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  // Collapse the line entirely when empty so it reserves no space — without a
  // header above it (unlocked vault), a blank reserved line reads as a top gap.
  // Un-hide before writing text so the aria-live region announces the change.
  statusEl.hidden = message.length === 0;
  statusEl.textContent = message;
  statusEl.classList.toggle("ok", ok);
}

export function hideTotpSecretSourceHint(els: SidebarDom): void {
  els.totpSecretSourceHint.textContent = "";
  els.totpSecretSourceHint.classList.add("hidden");
}

export function showTotpSecretSourceHint(els: SidebarDom): void {
  els.totpSecretSourceHint.textContent =
    "Filled from the open CUNY \"add authentication\" page.";
  els.totpSecretSourceHint.classList.remove("hidden");
}

const warnSessionStorageUnavailable = (context: string, error: unknown): void => {
  if (import.meta.env.MODE !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[CUNYAutoLogin] sidebar.utils: ${context}`, error);
  }
};

export async function clearPendingTotpFromSession(): Promise<void> {
  try {
    await browser.storage.session?.remove(PENDING_TOTP_SECRET_SESSION_KEY);
  } catch (error) {
    warnSessionStorageUnavailable("clearPendingTotpFromSession failed", error);
  }
}

export async function applyPendingTotpFromPage(els: SidebarDom): Promise<void> {
  try {
    const result = await browser.storage.session?.get(PENDING_TOTP_SECRET_SESSION_KEY);
    const secret = result?.[PENDING_TOTP_SECRET_SESSION_KEY];
    if (typeof secret !== "string" || !secret.length) {
      return;
    }
    const current = els.totpSecret.value.trim().replace(/\s+/g, "").toUpperCase();
    if (current === secret) {
      await clearPendingTotpFromSession();
      return;
    }
    els.totpSecret.value = secret;
    showTotpSecretSourceHint(els);
    await clearPendingTotpFromSession();
  } catch (error) {
    warnSessionStorageUnavailable("applyPendingTotpFromPage failed", error);
  }
}

/**
 * Group a Base32 secret into space-separated 4-character blocks for legibility
 * in the Advanced "Show secret key" reveal. Whitespace is stripped first, so
 * an already-grouped value re-groups cleanly. Copy still uses the raw,
 * ungrouped secret (see vaultController copy handler).
 */
export function groupSecretForDisplay(secret: string): string {
  const normalized = secret.trim().replace(/\s+/g, "");
  return normalized.match(/.{1,4}/g)?.join(" ") ?? "";
}

/**
 * Sidebar management hides the TOTP field; when the field is empty,
 * re-encrypt using the session payload secret.
 */
export function effectiveTotpSecretForSave(
  fieldValue: string,
  sessionTotp: string | null | undefined,
  sidebarManagement: boolean
): string {
  const fromField = fieldValue.trim().replace(/\s+/g, "");
  if (fromField.length > 0) return fromField;
  if (sidebarManagement && sessionTotp) {
    return sessionTotp.trim().replace(/\s+/g, "");
  }
  return "";
}
