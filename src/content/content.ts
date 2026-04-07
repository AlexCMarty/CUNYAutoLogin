import browser from "webextension-polyfill";
import { TOTP } from "totp-generator";
import { ok, err, Result } from "neverthrow";
import {
  CREDENTIAL_INPUT_IDS,
  matchesCredentialPage,
  matchesRuiMfaEnrollVerifyPage,
  RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID,
  RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS,
  matchesTotpEnrollPage,
  matchesTotpPage,
  TOTP_GENERATION_OPTIONS,
  TOTP_OTP_INPUT_ID,
  TOTP_VERIFY_BUTTON_LABEL,
} from "../cuny/ssoSite";
import {
  parseTotpSecretFromEnrollDom,
  setInputValue,
  isFillMessage,
  type FillMessage,
} from "./content.utils";

const LOG_PREFIX = "[CUNYAutoLogin]";

function log(...args: unknown[]): void {
  if (!import.meta.env.DEV) return;
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

function logMfaEnrollVerify(...args: unknown[]): void {
  log("MFA self-service · TOTP verify:", ...args);
}

/**
 * Fills the enrollment “verify now” OTP field from the vault. Returns true when the code was
 * applied; false if the vault is unavailable or another error occurred (caller may retry).
 */
async function tryFillMfaEnrollVerifyOtp(otpInput: HTMLInputElement): Promise<boolean> {
  try {
    const response = await browser.runtime.sendMessage({ type: "AUTO_FILL_REQUEST" }) as
      | { success: true; payload: FillMessage["payload"] }
      | { success: false; reason: string };

    if (!response.success) {
      if (response.reason === "no_session_master") {
        logMfaEnrollVerify("vault locked — unlock the extension popup to fill the 6-digit code");
      } else if (response.reason === "no_vault") {
        logMfaEnrollVerify("vault not set up — save credentials in the extension first");
      } else {
        logMfaEnrollVerify("cannot read vault:", response.reason);
      }
      return false;
    }

    const otp = await getOtp(response.payload.totpSecret);
    setInputValue(otpInput, otp);
    logMfaEnrollVerify("filled 6-digit code");
    return true;
  } catch (e) {
    logMfaEnrollVerify("error —", e);
    return false;
  }
}

/**
 * After “My authentication factors”, the MFA app keeps one URL (`…/oaa/rui/index.html?h_ra=1` for
 * this step). The OTP field is not in the DOM until the user clicks **Verify Now**, so we poll on
 * an interval instead of relying on MutationObserver (the Oracle UI re-renders in ways that made
 * observers flaky). Polling continues until a code is written or the tab navigates away.
 */
function startMfaEnrollVerifyOtpPolling(): void {
  logMfaEnrollVerify(
    "polling every",
    RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS,
    "ms — SPA keeps one URL on this flow; the OTP field appears only after Verify Now, so we poll instead of MutationObserver",
  );
  let otpFilled = false;
  let vaultRequestInFlight = false;
  let loggedOtpFieldFound = false;
  const pollIntervalId = window.setInterval(() => {
    if (otpFilled) {
      window.clearInterval(pollIntervalId);
      return;
    }

    const otpField = document.getElementById(RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID);
    if (!(otpField instanceof HTMLInputElement)) {
      return;
    }

    if (!loggedOtpFieldFound) {
      loggedOtpFieldFound = true;
      logMfaEnrollVerify("found verify OTP field", otpField);
    }

    if (vaultRequestInFlight) {
      return;
    }

    vaultRequestInFlight = true;
    void tryFillMfaEnrollVerifyOtp(otpField).then((didFill) => {
      vaultRequestInFlight = false;
      if (didFill) {
        otpFilled = true;
        window.clearInterval(pollIntervalId);
      }
    });
  }, RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS);
}

if (matchesRuiMfaEnrollVerifyPage(window.location.href)) {
  startMfaEnrollVerifyOtpPolling();
}

if (matchesTotpEnrollPage(window.location.href)) {
  void watchTotpSecretOnEnrollPage();
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isFillMessage(message)) return;
  log("runtime.onMessage FILL_CREDENTIALS — triggering main()");
  void main(message.payload);
});