import browser from "webextension-polyfill";
import { TOTP } from "totp-generator";
import { err, ok, type Result } from "neverthrow";
import {
  TOTP_GENERATION_OPTIONS,
  TOTP_OTP_INPUT_ID,
  TOTP_VERIFY_BUTTON_LABEL,
} from "../cuny/ssoSite";
import type { OnboardingLoginProgress } from "../onboarding/messages";
import { setInputValue } from "./content.utils";
import { waitForElement, waitForInputById } from "./domWait";

export const getOtp = async (secret: string): Promise<string> => {
  const { otp } = await TOTP.generate(secret, TOTP_GENERATION_OPTIONS);
  return otp;
};

/**
 * Fire-and-forget per-step login-progress bead for the sidebar checklist.
 * Errors are swallowed so a torn-down extension port never blocks the fill.
 */
const reportLoginProgress = (step: OnboardingLoginProgress["step"]): void => {
  const message: OnboardingLoginProgress = { type: "ONBOARDING_LOGIN_PROGRESS", step };
  void browser.runtime.sendMessage(message).catch(() => undefined);
};

type FillTotpError =
  | "otp_input_not_found"
  | "verify_button_not_found"
  | "otp_generation_failed";

export const fillTotp = async (totpSecret: string): Promise<Result<true, FillTotpError>> => {
  const [totpElm, verifyBtn] = await Promise.all([
    waitForInputById(TOTP_OTP_INPUT_ID),
    waitForElement(
      () =>
        Array.from(document.querySelectorAll("button")).find((button) =>
          button.innerHTML.includes(TOTP_VERIFY_BUTTON_LABEL)
        ) ?? null
    ),
  ]);

  if (!totpElm) return err("otp_input_not_found");
  if (!verifyBtn) return err("verify_button_not_found");

  reportLoginProgress("code_filling");
  // A malformed Base32 secret makes TOTP.generate reject. Keep that inside the
  // Result contract instead of throwing past the caller's `isErr()` handling,
  // and bail before filling/clicking so a rejecting field never gets a code.
  let otp: string;
  try {
    otp = await getOtp(totpSecret);
  } catch {
    return err("otp_generation_failed");
  }
  setInputValue(totpElm, otp);
  verifyBtn.click();
  reportLoginProgress("code_done");
  return ok(true);
};
