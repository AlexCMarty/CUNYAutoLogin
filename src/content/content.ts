import browser from "webextension-polyfill";
import { TOTP } from 'totp-generator';
import { ok, err, Result } from "neverthrow";

const LOG_PREFIX = "[CUNY SSO Helper]";

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

async function fillCredentials(): Promise<Result<true, string>> {
  const [usernameElm, passwordElm, submitBtn] = await Promise.all([
    waitForInputById('CUNYLoginUsernameDisplay'),
    waitForInputById('CUNYLoginPassword'),
    waitForElement(() => {
      const el = document.getElementById('submit');
      return el instanceof HTMLButtonElement ? el : null;
    }),
  ]);

  if (!usernameElm) return err('credential page: username input not found');
  if (!passwordElm) return err('credential page: password input not found');
  if (!submitBtn) return err('credential page: submit button not found');

  log("credential inputs found:", usernameElm, passwordElm, submitBtn);
  // TODO: read from vault and fill usernameElm.value / passwordElm.value, then submitBtn.click()
  return ok(true);
}

async function fillTotp(): Promise<Result<true, string>> {
  const [totpElm, verifyBtn] = await Promise.all([
    waitForInputById('otpValue|input'),
    waitForElement(() =>
      Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('Verify')) ?? null
    ),
  ]);

  if (!totpElm) return err('TOTP page: OTP input not found');
  if (!verifyBtn) return err('TOTP page: Verify button not found');

  log("TOTP input and verify button found:", totpElm, verifyBtn);
  // TODO: generate OTP via getOtp() and fill totpElm.value, then verifyBtn.click()
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

// getOtp is a stub pending vault wiring — suppress the unused-declaration warning
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void getOtp;