import browser from "webextension-polyfill";
import { TOTP } from 'totp-generator';
import { ok, err, Result } from "neverthrow";

const LOG_PREFIX = "[CUNY SSO Helper]";

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args);
}

/**
 * Waits for an element with the given ID to appear in the DOM.
 * Uses MutationObserver so it fires the moment the element is inserted —
 * no polling. Needed because both CUNY SSO pages render their form inputs
 * asynchronously via Oracle JET / RequireJS, long after document_idle fires.
 *
 * Uses getElementById so special characters in IDs (e.g. the | in
 * "otpValue|input") are treated as plain strings, not CSS namespace syntax.
 *
 * Resolves null after timeoutMs if the element never appears.
 */
function waitForElementById(id: string, timeoutMs = 10000): Promise<HTMLInputElement | null> {
  return new Promise((resolve) => {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLInputElement) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      log(`timed out waiting for element with id="${id}"`);
      resolve(null);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const el = document.getElementById(id);
      if (el instanceof HTMLInputElement) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function fillCredentials(): Promise<Result<true, string>> {
  const [usernameElm, passwordElm] = await Promise.all([
    waitForElementById('CUNYLoginUsernameDisplay'),
    waitForElementById('CUNYLoginPassword'),
  ]);

  if (!usernameElm) return err('credential page: username input not found');
  if (!passwordElm) return err('credential page: password input not found');

  log("credential inputs found:", usernameElm, passwordElm);
  // TODO: read from vault and fill usernameElm.value / passwordElm.value, then submit
  return ok(true);
}

async function fillTotp(): Promise<Result<true, string>> {
  const totpElm = await waitForElementById('otpValue|input');

  if (!totpElm) return err('TOTP page: OTP input not found');

  log("TOTP input found:", totpElm);
  // TODO: generate OTP via getOtp() and fill totpElm.value, then submit
  return ok(true);
}

async function getOtp(): Promise<string> {
  // TODO: read TOTP secret from vault instead of hardcoding
  const { otp } = await TOTP.generate('', {
    algorithm: "SHA-1",
    digits: 6,
    period: 30,
  });
  return otp;
}

async function main(): Promise<void> {
  const url = window.location.href;
  log("content script active", url);

  let result: Result<true, string>;

  if (url.includes('/oam/server/obrareq.cgi')) {
    result = await fillCredentials();
  } else if (url.includes('/oaa-totp-factor/')) {
    result = await fillTotp();
  } else {
    log("unrecognised page, doing nothing");
    return;
  }

  if (result.isErr()) {
    log("error:", result.error);
  }
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type: unknown }).type === "FILL_CREDENTIALS"
  ) {
    log("runtime.onMessage FILL_CREDENTIALS — triggering main()");
    main();
  }
});

main();
getOtp(); // to shut up linter