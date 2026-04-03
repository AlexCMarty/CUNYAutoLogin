import browser from "webextension-polyfill";
import { TOTP } from "totp-generator";
import { ok, err, Result } from "neverthrow";
import {
  CREDENTIAL_INPUT_IDS,
  matchesCredentialPage,
  matchesRuiIndexHraUrl,
  RUI_INDEX_H_RA_OTP_INPUT_ID,
  matchesTotpEnrollPage,
  matchesTotpPage,
  TOTP_GENERATION_OPTIONS,
  TOTP_OTP_INPUT_ID,
  TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY,
  TOTP_VERIFY_BUTTON_LABEL,
} from "../cuny/ssoSite";

const LOG_PREFIX = "[CUNYAutoLogin]";

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args);
}

/**
 * Waits for a DOM element to appear by repeatedly calling `find()` on every
 * DOM mutation. Uses MutationObserver so it fires the moment the element is
 * inserted — no polling. Needed because both CUNY SSO pages render their form
 * inputs asynchronously via Oracle JET / RequireJS, long after document_idle
 * fires.
 *
 * Resolves null after timeoutMs if find() never returns a non-null value.
 */
function waitForElement<T extends HTMLElement>(
  find: () => T | null,
  timeoutMs = 10000
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = find();
    if (existing) { resolve(existing); return; }

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const el = find();
      if (el) { clearTimeout(timer); observer.disconnect(); resolve(el); }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

/**
 * Convenience wrapper around waitForElement for inputs looked up by ID.
 * Uses getElementById rather than querySelector so special characters in IDs
 * (e.g. the | in "otpValue|input") are treated as plain strings, not CSS
 * namespace syntax.
 */
function waitForInputById(id: string, timeoutMs = 10000): Promise<HTMLInputElement | null> {
  return waitForElement(
    () => { const el = document.getElementById(id); return el instanceof HTMLInputElement ? el : null; },
    timeoutMs
  );
}

const TOTP_SECRET_SELECTOR = `[aria-labelledby="${TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY}"]`;

/** Min/max length for Base32 secret after stripping separators (CUNY typically ~32 chars). */
const TOTP_SECRET_LEN_MIN = 10;
const TOTP_SECRET_LEN_MAX = 128;

function normalizeTotpSecretCandidate(raw: string): string | null {
  const normalized = raw.replace(/\s+/g, "").toUpperCase().replace(/=+$/, "");
  if (normalized.length < TOTP_SECRET_LEN_MIN || normalized.length > TOTP_SECRET_LEN_MAX) {
    return null;
  }
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function parseTotpSecretFromEnrollDom(): string | null {
  const el = document.querySelector(TOTP_SECRET_SELECTOR);
  if (!(el instanceof HTMLElement)) {
    return null;
  }
  return normalizeTotpSecretCandidate(el.textContent ?? "");
}

/**
 * Waits until the enroll page injects a plausible Base32 secret into the labelled node.
 */
function waitForEnrollTotpSecret(timeoutMs = 120000): Promise<string | null> {
  return new Promise((resolve) => {
    const existing = parseTotpSecretFromEnrollDom();
    if (existing) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const s = parseTotpSecretFromEnrollDom();
      if (s) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(s);
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

let lastPostedEnrollTotpSecret: string | null = null;

async function watchTotpSecretOnEnrollPage(): Promise<void> {
  const secret = await waitForEnrollTotpSecret();
  if (!secret || secret === lastPostedEnrollTotpSecret) {
    return;
  }
  try {
    await browser.runtime.sendMessage({ type: "TOTP_SECRET_FROM_PAGE", secret });
    lastPostedEnrollTotpSecret = secret;
  } catch {
    // e.g. extension reloaded — ignore
  }
}

/**
 * Sets an input's value in a way that notifies Oracle JET's Knockout.js bindings.
 * A plain `.value =` assignment bypasses the framework's change detection, so we
 * use the native HTMLInputElement prototype setter and then dispatch the events
 * that KO listens for.
 */
function setInputValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function fillCredentials(email: string, password: string): Promise<Result<true, string>> {
  const [usernameElm, passwordElm, submitBtn] = await Promise.all([
    waitForInputById(CREDENTIAL_INPUT_IDS.username),
    waitForInputById(CREDENTIAL_INPUT_IDS.password),
    waitForElement(() => {
      const el = document.getElementById(CREDENTIAL_INPUT_IDS.submitButton);
      return el instanceof HTMLButtonElement ? el : null;
    }),
  ]);

  if (!usernameElm) return err('credential page: username input not found');
  if (!passwordElm) return err('credential page: password input not found');
  if (!submitBtn) return err('credential page: submit button not found');

  setInputValue(usernameElm, email);
  setInputValue(passwordElm, password);
  submitBtn.click();
  return ok(true);
}

async function getOtp(secret: string): Promise<string> {
  const { otp } = await TOTP.generate(secret, TOTP_GENERATION_OPTIONS);
  return otp;
}

async function fillTotp(totpSecret: string): Promise<Result<true, string>> {
  const [totpElm, verifyBtn] = await Promise.all([
    waitForInputById(TOTP_OTP_INPUT_ID),
    waitForElement(() =>
      Array.from(document.querySelectorAll("button")).find((b) =>
        b.innerHTML.includes(TOTP_VERIFY_BUTTON_LABEL)
      ) ?? null
    ),
  ]);

  if (!totpElm) return err('TOTP page: OTP input not found');
  if (!verifyBtn) return err('TOTP page: Verify button not found');

  const otp = await getOtp(totpSecret);
  setInputValue(totpElm, otp);
  verifyBtn.click();
  return ok(true);
}

interface FillMessage {
  type: "FILL_CREDENTIALS";
  payload: {
    email: string;
    password: string;
    totpSecret: string;
  };
}

function isFillMessage(msg: unknown): msg is FillMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== "FILL_CREDENTIALS") return false;
  const p = m.payload;
  if (typeof p !== "object" || p === null) return false;
  const payload = p as Record<string, unknown>;
  return (
    typeof payload.email === "string" &&
    typeof payload.password === "string" &&
    typeof payload.totpSecret === "string"
  );
}

async function main(payload: FillMessage["payload"]): Promise<void> {
  const url = window.location.href;
  log("main() triggered", url);

  let result: Result<true, string>;
  if (matchesCredentialPage(url)) {
    result = await fillCredentials(payload.email, payload.password);
  } else if (matchesTotpPage(url)) {
    result = await fillTotp(payload.totpSecret);
  } else {
    log("unrecognised page, doing nothing");
    return;
  }

  if (result.isErr()) {
    log("error:", result.error);
  }
}

async function autoFill(): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({ type: "AUTO_FILL_REQUEST" }) as
      | { success: true; payload: FillMessage["payload"] }
      | { success: false; reason: string };

    if (!response.success) {
      log("autoFill:", response.reason);
      return;
    }
    log("autoFill: credentials received, triggering main()");
    await main(response.payload);
  } catch (e) {
    log("autoFill: error —", e);
  }
}

void autoFill();

/** Returns true once OTP was written; false to retry later (e.g. vault still locked). */
async function tryFillRuiHraOtp(otpInput: HTMLInputElement): Promise<boolean> {
  try {
    const response = await browser.runtime.sendMessage({ type: "AUTO_FILL_REQUEST" }) as
      | { success: true; payload: FillMessage["payload"] }
      | { success: false; reason: string };

    if (!response.success) {
      if (response.reason === "no_session_master") {
        log("RUI h_ra=1: vault locked — unlock the extension popup to fill OTP");
      } else if (response.reason === "no_vault") {
        log("RUI h_ra=1: vault not set up");
      } else {
        log("RUI h_ra=1: cannot read vault:", response.reason);
      }
      return false;
    }

    const otp = await getOtp(response.payload.totpSecret);
    setInputValue(otpInput, otp);
    log("RUI h_ra=1: filled OTP");
    return true;
  } catch (e) {
    log("RUI h_ra=1: error —", e);
    return false;
  }
}

function onRuiIndexHraPage(): void {
  log("RUI index page (exact h_ra=1 URL)");
  let filled = false;
  let fillInFlight = false;
  let loggedFoundOtpInput = false;
  const intervalId = window.setInterval(() => {
    if (filled) {
      window.clearInterval(intervalId);
      return;
    }

    const el = document.getElementById(RUI_INDEX_H_RA_OTP_INPUT_ID);
    if (!(el instanceof HTMLInputElement)) {
      return;
    }

    if (!loggedFoundOtpInput) {
      loggedFoundOtpInput = true;
      log("RUI h_ra=1: found OTP input", el);
    }

    if (fillInFlight) {
      return;
    }

    fillInFlight = true;
    void tryFillRuiHraOtp(el).then((ok) => {
      fillInFlight = false;
      if (ok) {
        filled = true;
        window.clearInterval(intervalId);
      }
    });
  }, 500);
}

if (matchesRuiIndexHraUrl(window.location.href)) {
  onRuiIndexHraPage();
}

if (matchesTotpEnrollPage(window.location.href)) {
  void watchTotpSecretOnEnrollPage();
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isFillMessage(message)) return;
  log("runtime.onMessage FILL_CREDENTIALS — triggering main()");
  void main(message.payload);
});