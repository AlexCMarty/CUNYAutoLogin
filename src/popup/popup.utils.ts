import browser from "webextension-polyfill";
import { LOGIN_EMAIL_SUFFIX, PENDING_TOTP_SECRET_SESSION_KEY } from "../cuny/ssoSite";
import type { VaultError } from "../crypto/vault";

export const DRAFT_KEY = "cuny_form_draft";

export interface FormDraft {
  email: string;
  password: string;
  totpSecret: string;
}

export interface PopupDom {
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

/** Parse and validate a raw localStorage draft string. Returns null on bad JSON or non-object. */
export function parseDraft(raw: string): FormDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const d = parsed as Record<string, unknown>;
  return {
    email: typeof d.email === "string" ? d.email : "",
    password: typeof d.password === "string" ? d.password : "",
    totpSecret: typeof d.totpSecret === "string" ? d.totpSecret : "",
  };
}

export function setStatus(message: string, ok = false): void {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("ok", ok);
}

export function hideTotpSecretSourceHint(els: PopupDom): void {
  els.totpSecretSourceHint.textContent = "";
  els.totpSecretSourceHint.classList.add("hidden");
}

export function showTotpSecretSourceHint(els: PopupDom): void {
  els.totpSecretSourceHint.textContent =
    "Filled from the open CUNY \u201cadd authentication\u201d page.";
  els.totpSecretSourceHint.classList.remove("hidden");
}

export function saveDraft(els: PopupDom): void {
  const draft: FormDraft = {
    email: els.email.value,
    password: els.password.value,
    totpSecret: els.totpSecret.value,
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function clearPendingTotpFromSession(): Promise<void> {
  try {
    await browser.storage.session?.remove(PENDING_TOTP_SECRET_SESSION_KEY);
  } catch {
    // session storage unavailable
  }
}

export async function applyPendingTotpFromPage(els: PopupDom): Promise<void> {
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
    saveDraft(els);
  } catch {
    // session storage unavailable
  }
}
