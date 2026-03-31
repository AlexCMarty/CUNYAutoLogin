import browser from "webextension-polyfill";
import { TOTP } from 'totp-generator';
import { ok, err, Result } from "neverthrow";

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

  setInputValue(usernameElm, email);
  setInputValue(passwordElm, password);
  submitBtn.click();
  return ok(true);
}

async function getOtp(secret: string): Promise<string> {
  const { otp } = await TOTP.generate(secret, {
    algorithm: "SHA-1",
    digits: 6,
    period: 30,
  });
  return otp;
}

async function fillTotp(totpSecret: string): Promise<Result<true, string>> {
  const [totpElm, verifyBtn] = await Promise.all([
    waitForInputById('otpValue|input'),
    waitForElement(() =>
      Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('Verify')) ?? null
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
  // obrareq.cgi is when i'm redirected from most CUNY sites, like Degreeworks.
  // samlv20 is when I'm redirected specifically from Brightspace... even though the pages look identical...
  // otherwise, the autofill works identically
  if (url.includes('/oam/server/obrareq.cgi') || url.includes('/oamfed/idp/samlv20')) {
    result = await fillCredentials(payload.email, payload.password);
  } else if (url.includes('/oaa-totp-factor/')) {
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

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isFillMessage(message)) return;
  log("runtime.onMessage FILL_CREDENTIALS — triggering main()");
  void main(message.payload);
});