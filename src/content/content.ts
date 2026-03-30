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
  return otp
}
getOtp();


function main(): Result<boolean, string> {
  // first, I get the elements. 
  /*
  I need username and password and totp elements.
  if username and password exist but totp doesn't run that flow.
  otherwiser un totp fill flow.
  then it returns here and clicks submit.
   */
  console.log("main called");
  const usernameElm = document.querySelector('#CUNYLoginUsernameDisplay') as HTMLInputElement | null;
  const passwordElm = document.querySelector('#CUNYLoginPassword') as HTMLInputElement | null;
  const totpElm = document.querySelector('#otpValue|input') as HTMLInputElement | null;
  console.log(totpElm);
  if (usernameElm && passwordElm && !totpElm) {
    log("I see a username and password but no TOTP");
    return ok(true);
  } else if (totpElm && !usernameElm && !passwordElm) {
    log("I see a TOTP but no username nor password");
    return ok(true);
  } else {
    log("I see... nothing. oh man");
    console.log(totpElm);
    return err("I see nothing");
  }
}

window.addEventListener("load", () => {
  main()
});