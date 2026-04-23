import browser from "webextension-polyfill";
import { TOTP } from "totp-generator";
import { ok, err, Result } from "neverthrow";
import {
  CREDENTIAL_ERROR_ELEMENT_ID,
  CREDENTIAL_ERROR_TEXT_MARKER,
  CREDENTIAL_INPUT_IDS,
  matchesCredentialErrorUrl,
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
  simulateKeystrokes,
  isFillMessage,
  type FillMessage,
  hasCredentialErrorInDom,
  POST_SUBMIT_ERROR_OBSERVE_MS,
} from "./content.utils";
import { mountCredentialErrorBanner } from "./banner";
import type {
  AutoFillRequest,
  AutoFillResponse,
  OnboardingCredentialError,
  OnboardingStageDetected,
  TotpSecretFromPage,
} from "../onboarding/messages";

const LOG_PREFIX = "[CUNYAutoLogin]";

function log(...args: unknown[]): void {
  if (!import.meta.env.DEV) return;
  console.log(LOG_PREFIX, ...args);
}

/**
 * Plan-05 single-submit guard. Each content-script lifetime (one page load)
 * is allowed at most one auto-submit. After the submit click, Oracle either
 * navigates (new lifetime, guard resets) or re-renders with the serverError
 * element in place (this lifetime, guard still true). We also set the guard
 * when we land on `/oam/server/auth_cred_submit` (the form POST target; see
 * `main()` for DOM-confirmed credential-error reporting).
 */
let submitAttempted = false;

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
    const message: TotpSecretFromPage = { type: "TOTP_SECRET_FROM_PAGE", secret };
    await browser.runtime.sendMessage(message);
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

/**
 * Plan-05 hook: tell the sidebar that we just detected a wrong-credential
 * state on the CUNY page AND show the extension-branded banner so the student
 * notices even without looking at the sidebar.
 *
 * Culprit is always "password" per spec (`§Screen 4-error` design note): by
 * the time we get here the student has already passed the `@login.cuny.edu`
 * validation on Screen 2, so wrong-password is the more likely culprit.
 */
async function reportCredentialError(): Promise<void> {
  mountCredentialErrorBanner();
  const message: OnboardingCredentialError = {
    type: "ONBOARDING_CREDENTIAL_ERROR",
    culprit: "password",
  };
  try {
    await browser.runtime.sendMessage(message);
  } catch {
    // Extension reloaded or messaging unavailable — banner still tells the
    // student to look at the sidebar.
  }
}

/**
 * Plan-05 hook: tell the sidebar we advanced past the credential page so it
 * can move OPENING_CUNY → ALLOW_GATE. We fire this from the TOTP page (the
 * first post-credential page returning users see) and from any other
 * non-credential SSO page the content script lands on. Plan-06 will refine
 * with a proper Allow/Deny detection step.
 */
async function announceCredentialsAccepted(): Promise<void> {
  const message: OnboardingStageDetected = {
    type: "ONBOARDING_STAGE_DETECTED",
    stage: "allow_gate",
  };
  try {
    await browser.runtime.sendMessage(message);
  } catch {
    // Extension reloaded — sidebar will miss this transition; UI remains
    // navigable via Back.
  }
}

/**
 * After a submit click Oracle sometimes re-renders the same URL with the
 * `#serverError` alert inserted instead of navigating to
 * `/oam/server/auth_cred_submit`. Watch the DOM for that element — bounded by
 * POST_SUBMIT_ERROR_OBSERVE_MS so we don't leak an observer.
 *
 * Observer is started BEFORE the submit click by the caller, because the
 * fixture (and Oracle, under some branches) inserts `#serverError`
 * synchronously during the click handler — a post-click observer would miss
 * the mutation. If the element is already present when this function runs
 * (an Oracle edge case or a late mount on the error URL), the check fires
 * immediately via the initial `hasCredentialErrorInDom` probe.
 */
function watchForPostSubmitCredentialError(): void {
  if (hasCredentialErrorInDom(document)) {
    void reportCredentialError();
    return;
  }
  let reported = false;
  const tearDown = (): void => {
    observer.disconnect();
    clearTimeout(timer);
  };
  const observer = new MutationObserver(() => {
    if (reported) return;
    if (!hasCredentialErrorInDom(document)) return;
    reported = true;
    tearDown();
    void reportCredentialError();
  });
  const timer = setTimeout(tearDown, POST_SUBMIT_ERROR_OBSERVE_MS);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

async function main(payload: FillMessage["payload"]): Promise<void> {
  const url = window.location.href;
  log("main() triggered", url);

  // `/oam/server/auth_cred_submit` is the credential form's POST target, not
  // an error-only URL. Oracle lands here on BOTH success and failure — on
  // success the page client-side redirects away without rendering the
  // `#serverError` marker, so URL-alone yields a spurious banner during the
  // brief transition. Require DOM confirmation (sync now or via observer).
  if (matchesCredentialErrorUrl(url)) {
    log("credential-error URL reached", url);
    submitAttempted = true;
    if (hasCredentialErrorInDom(document)) {
      await reportCredentialError();
      return;
    }
    watchForPostSubmitCredentialError();
    return;
  }

  if (matchesCredentialPage(url)) {
    // Oracle sometimes renders the alert inline on the same URL; treat that
    // identically to the redirect path. Still do NOT refill.
    if (hasCredentialErrorInDom(document)) {
      log("credential-error DOM alert detected on credential URL", url);
      submitAttempted = true;
      await reportCredentialError();
      return;
    }
    if (submitAttempted) {
      log("skipping refill — submit already attempted on this lifetime");
      return;
    }
    submitAttempted = true;
    // IMPORTANT: install the mutation observer BEFORE clicking submit. The
    // inline error re-render path (fixture ?wrong=1 and Oracle's own client-
    // side branch) inserts `#serverError` synchronously during the click
    // handler. An observer installed after the click would miss the mutation
    // and the sidebar would never leave OPENING_CUNY.
    watchForPostSubmitCredentialError();
    const result = await fillCredentials(payload.email, payload.password);
    if (result.isErr()) log("error:", result.error);
    return;
  }

  if (matchesTotpPage(url)) {
    // We only reach the TOTP page (or the Allow page post-TOTP) after CUNY
    // accepted the credentials. Tell the sidebar to advance Screen 4 → 5.
    await announceCredentialsAccepted();
    if (payload.totpSecret.length > 0) {
      const result = await fillTotp(payload.totpSecret);
      if (result.isErr()) log("error:", result.error);
    }
    return;
  }

  log("unrecognised page, doing nothing");
}

async function autoFill(): Promise<void> {
  try {
    const request: AutoFillRequest = { type: "AUTO_FILL_REQUEST" };
    const response = (await browser.runtime.sendMessage(request)) as AutoFillResponse;

    if (!response.success) {
      log("autoFill:", response.reason);
      // Even when there are no credentials to fill (e.g. vault locked), we
      // still handle the credential-error page so the student sees the banner
      // + sidebar routing after a failed submit.
      const url = window.location.href;
      const credErrorDom = hasCredentialErrorInDom(document);
      if (
        credErrorDom &&
        (matchesCredentialErrorUrl(url) || matchesCredentialPage(url))
      ) {
        submitAttempted = true;
        await reportCredentialError();
      }
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
    const request: AutoFillRequest = { type: "AUTO_FILL_REQUEST" };
    const response = (await browser.runtime.sendMessage(request)) as AutoFillResponse;

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

    if (response.payload.totpSecret.length === 0) {
      logMfaEnrollVerify("no TOTP secret available yet — still in onboarding");
      return false;
    }
    const otp = await getOtp(response.payload.totpSecret);
    simulateKeystrokes(otpInput, otp);
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

// Re-export selected helpers for other content-module imports. `CREDENTIAL_ERROR_ELEMENT_ID`
// and `CREDENTIAL_ERROR_TEXT_MARKER` live on `ssoSite` — keep them transitively reachable via
// this module for anyone browsing the content script namespace.
export { CREDENTIAL_ERROR_ELEMENT_ID, CREDENTIAL_ERROR_TEXT_MARKER };

// isFillMessage is only called in the DEV block below; Vite tree-shakes it from
// the production IIFE because import.meta.env.DEV evaluates to false at build time.
if (import.meta.env.DEV) {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isFillMessage(message)) return;
    log("runtime.onMessage FILL_CREDENTIALS — triggering main()");
    void main(message.payload);
  });
}
