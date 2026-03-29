import browser from "webextension-polyfill";

const LOG_PREFIX = "[CUNY SSO Helper]";

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args);
}

function findUsernameInput(): HTMLInputElement | null {
  const byEmail = document.querySelector('input[type="email"]');
  if (byEmail instanceof HTMLInputElement) return byEmail;

  const byName = document.querySelector('input[name*="user" i]');
  if (byName instanceof HTMLInputElement) return byName;

  const byId = document.querySelector('input[id*="user" i]');
  if (byId instanceof HTMLInputElement) return byId;

  const form = document.querySelector("form");
  if (form) {
    const text = form.querySelector('input[type="text"]');
    if (text instanceof HTMLInputElement) return text;
  }

  return null;
}

function findPasswordInput(): HTMLInputElement | null {
  const el = document.querySelector('input[type="password"]');
  return el instanceof HTMLInputElement ? el : null;
}

function findLoginSubmit(): HTMLElement | null {
  const submitBtn = document.querySelector('button[type="submit"]');
  if (submitBtn instanceof HTMLElement) return submitBtn;

  const submitInput = document.querySelector('input[type="submit"]');
  if (submitInput instanceof HTMLElement) return submitInput;

  const buttons = document.querySelectorAll("button");
  for (const b of buttons) {
    if (/log\s*in/i.test(b.textContent ?? "")) return b;
  }

  return null;
}

function findTotpInput(): HTMLInputElement | null {
  const byOtpName = document.querySelector('input[name*="otp" i]');
  if (byOtpName instanceof HTMLInputElement) return byOtpName;

  const byOtc = document.querySelector(
    'input[autocomplete="one-time-code"]'
  );
  if (byOtc instanceof HTMLInputElement) return byOtc;

  const byMode = document.querySelector('input[inputmode="numeric"]');
  if (byMode instanceof HTMLInputElement) return byMode;

  const byLen = document.querySelector('input[maxlength="6"]');
  if (byLen instanceof HTMLInputElement) return byLen;

  return null;
}

function findVerifySubmit(): HTMLElement | null {
  const submitBtn = document.querySelector('button[type="submit"]');
  if (submitBtn instanceof HTMLElement) return submitBtn;

  const buttons = document.querySelectorAll("button");
  for (const b of buttons) {
    if (/verify/i.test(b.textContent ?? "")) return b;
  }

  const submitInput = document.querySelector('input[type="submit"]');
  if (submitInput instanceof HTMLElement) return submitInput;

  return null;
}

function probeDom(): void {
  const user = findUsernameInput();
  const pass = findPasswordInput();
  const loginBtn = findLoginSubmit();
  log("URL:", window.location.href);
  log("username field:", user ? `found (${describeEl(user)})` : "not found");
  log("password field:", pass ? `found (${describeEl(pass)})` : "not found");
  log(
    "log in control:",
    loginBtn ? `found (${describeEl(loginBtn)})` : "not found"
  );

  const totp = findTotpInput();
  const verifyBtn = findVerifySubmit();
  log("TOTP field:", totp ? `found (${describeEl(totp)})` : "not found");
  log(
    "Verify control:",
    verifyBtn ? `found (${describeEl(verifyBtn)})` : "not found"
  );
}

function describeEl(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const name = el.getAttribute("name");
  const namePart = name ? `[name=${JSON.stringify(name)}]` : "";
  return `${tag}${id}${namePart}`;
}

/** Stub: will fill username/password and submit when wired to vault. */
function fillCredentials(): void {
  log("stub fillCredentials()");
}

/** Stub: will fill TOTP and verify when wired to vault. */
function fillTOTP(): void {
  log("stub fillTOTP()");
}

function onRuntimeMessage(message: unknown): void {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type: unknown }).type === "FILL_CREDENTIALS"
  ) {
    log("runtime.onMessage FILL_CREDENTIALS:", message);
  }
}

log("content script active", window.location.href);

probeDom();
fillCredentials();
fillTOTP();

browser.runtime.onMessage.addListener((message: unknown) => {
  onRuntimeMessage(message);
});
