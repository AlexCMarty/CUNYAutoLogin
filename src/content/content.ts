// import browser from "webextension-polyfill";
import { TOTP } from 'totp-generator';
import { ok, err, Result } from "neverthrow";

const LOG_PREFIX = "[CUNY SSO Helper]";

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args);
}

log("content script active", window.location.href);

async function getOtp(): Promise<string> {
  // i have to paste in the secret, i'm not so I don't accidentally commit it LOL
  const {otp} = await TOTP.generate('', {
    algorithm: "SHA-1",
    digits: 6,
    period: 30
  });
  log(otp);
  return otp;
}
getOtp();

/**
 * Waits for an element with the given ID to appear in the DOM.
 * Uses MutationObserver so it fires instantly when the element is inserted,
 * with no polling delay. Needed because the CUNY SSO pages use Oracle JET
 * (a RequireJS SPA) that renders form inputs asynchronously well after
 * document_idle and window "load" have both already fired.
 *
 * Falls back to null after `timeoutMs` if the element never appears.
 */
function waitForElementById(id: string, timeoutMs = 15000): Promise<HTMLInputElement | null> {
  return new Promise((resolve) => {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLInputElement) {
      resolve(existing);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      log(`waitForElementById: timed out waiting for #${id}`);
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

async function main(): Promise<Result<boolean, string>> {
  /*
  I need username and password and totp elements.
  if username and password exist but totp doesn't run that flow.
  otherwise run totp fill flow.
  then it returns here and clicks submit.
  */
  log("main called, waiting for form elements...");

  // getElementById handles special characters in IDs (like the | in otpValue|input)
  // querySelector('#otpValue|input') is INVALID CSS — | is a namespace separator operator
  const [usernameElm, passwordElm, totpElm] = await Promise.all([
    waitForElementById('CUNYLoginUsernameDisplay'),
    waitForElementById('CUNYLoginPassword'),
    waitForElementById('otpValue|input'),
  ]);

  log("usernameElm:", usernameElm);
  log("passwordElm:", passwordElm);
  log("totpElm:", totpElm);

  if (usernameElm && passwordElm && !totpElm) {
    log("I see a username and password but no TOTP");
    return ok(true);
  } else if (totpElm && !usernameElm && !passwordElm) {
    log("I see a TOTP but no username nor password");
    return ok(true);
  } else {
    log("I see... nothing. oh man");
    return err("I see nothing");
  }
}

main();