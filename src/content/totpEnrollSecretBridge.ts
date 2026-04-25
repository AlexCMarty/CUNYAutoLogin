import browser from "webextension-polyfill";
import type { TotpSecretFromPage } from "../onboarding/messages";
import { waitForEnrollTotpSecret } from "./domWait";

let lastPostedEnrollTotpSecret: string | null = null;

export const watchTotpSecretOnEnrollPage = async (): Promise<void> => {
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
};
