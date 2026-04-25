import { TOTP } from "totp-generator";
import { err, ok, type Result } from "neverthrow";
import {
  TOTP_GENERATION_OPTIONS,
  TOTP_OTP_INPUT_ID,
  TOTP_VERIFY_BUTTON_LABEL,
} from "../cuny/ssoSite";
import { setInputValue } from "./content.utils";
import { waitForElement, waitForInputById } from "./domWait";

export const getOtp = async (secret: string): Promise<string> => {
  const { otp } = await TOTP.generate(secret, TOTP_GENERATION_OPTIONS);
  return otp;
};

export const fillTotp = async (totpSecret: string): Promise<Result<true, string>> => {
  const [totpElm, verifyBtn] = await Promise.all([
    waitForInputById(TOTP_OTP_INPUT_ID),
    waitForElement(
      () =>
        Array.from(document.querySelectorAll("button")).find((button) =>
          button.innerHTML.includes(TOTP_VERIFY_BUTTON_LABEL)
        ) ?? null
    ),
  ]);

  if (!totpElm) return err("TOTP page: OTP input not found");
  if (!verifyBtn) return err("TOTP page: Verify button not found");

  const otp = await getOtp(totpSecret);
  setInputValue(totpElm, otp);
  verifyBtn.click();
  return ok(true);
};
