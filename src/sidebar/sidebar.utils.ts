import browser from "webextension-polyfill";
import { LOGIN_EMAIL_SUFFIX, PENDING_TOTP_SECRET_SESSION_KEY } from "../cuny/ssoSite";
import type { VaultError } from "../crypto/vault";

export const DRAFT_KEY = "cuny_form_draft";

/** Minimum character length enforced for the master password in both setup and change-master flows. */
export const MIN_MASTER_PASSWORD_LENGTH = 12;

export interface FormDraft {
  email: string;
  password: string;
  totpSecret: string;
}

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
}

export const validateEmail = (email: string): boolean =>
  email.trim().toLowerCase().endsWith(LOGIN_EMAIL_SUFFIX);

export const decryptStatusMessage = (e: VaultError): string =>
  e === "decrypt_failed"
    ? "Wrong master password or corrupted vault."
    : "Could not decrypt vault.";

/** Coerce an already-parsed unknown value into a FormDraft, or return null. */
export function coerceDraft(value: unknown): FormDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const d = value as Record<string, unknown>;
  return {
    email: typeof d.email === "string" ? d.email : "",
    password: typeof d.password === "string" ? d.password : "",
    totpSecret: typeof d.totpSecret === "string" ? d.totpSecret : "",
  };
}

/** Parse and validate a raw JSON draft string. Returns null on bad JSON or non-object. */
export function parseDraft(raw: string): FormDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return coerceDraft(parsed);
}

export function setStatus(message: string, ok = false): void {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("ok", ok);
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

/**
 * Persists the current setup-form fields to browser.storage.session (in-memory,
 * never written to disk). Called only while in setup mode — see vaultController.ts input listeners.
 */
export async function saveDraft(els: SidebarDom): Promise<void> {
  const draft: FormDraft = {
    email: els.email.value,
    password: els.password.value,
    totpSecret: els.totpSecret.value,
  };
  try {
    await browser.storage.session?.set({ [DRAFT_KEY]: draft });
  } catch {
    // session storage unavailable
  }
}

/** Removes the setup draft from session storage. */
export async function clearDraft(): Promise<void> {
  try {
    await browser.storage.session?.remove(DRAFT_KEY);
  } catch {
    // session storage unavailable
  }
}

export async function clearPendingTotpFromSession(): Promise<void> {
  try {
    await browser.storage.session?.remove(PENDING_TOTP_SECRET_SESSION_KEY);
  } catch {
    // session storage unavailable
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
    await saveDraft(els);
  } catch {
    // session storage unavailable
  }
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
