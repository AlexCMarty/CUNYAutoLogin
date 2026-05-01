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

type FillTotpError = "otp_input_not_found" | "verify_button_not_found";

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

  const otp = await getOtp(totpSecret);
  setInputValue(totpElm, otp);
  verifyBtn.click();
  return ok(true);
};
