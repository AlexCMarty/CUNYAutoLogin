import browser from "webextension-polyfill";
import type { Runtime } from "webextension-polyfill";
import {
  CREDENTIAL_ERROR_ELEMENT_ID,
  CREDENTIAL_ERROR_TEXT_MARKER,
  ENROLL_OVERLAY_REFRESH_INTERVAL_MS,
  matchesMfaConsentPage,
  matchesTotpEnrollPage,
  matchesTotpPage,
} from "../cuny/ssoSite";
import {
  isFillMessage,
  type FillMessage,
} from "./content.utils";
import { startRuiOnboardingObservers } from "./ruiOnboarding";
import type { AutoFillRequest, AutoFillResponse } from "../onboarding/messages";
import {
  announceCunyTotpChallenge,
  handleAutoFillFailureCredentialError,
  handleCredentialPageFlow,
} from "./credentialFlow";
import { fillTotp } from "./totpLoginFlow";
import { startMfaEnrollVerifyOtpPolling } from "./mfaEnrollVerifyFlow";
import { requestAndExecuteOverlayCommand } from "./overlayBridge";
import { installAllowConsentClickReporter } from "./allowConsentReporter";
import { watchTotpSecretOnEnrollPage } from "./totpEnrollSecretBridge";

const LOG_PREFIX = "[CUNYAutoLogin]";

function log(...args: unknown[]): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.log(LOG_PREFIX, ...args);
}

async function main(payload: FillMessage["payload"]): Promise<void> {
  const url = window.location.href;
  log("main() triggered", url);

  const handledCredentialPage = await handleCredentialPageFlow(payload, log);
  if (handledCredentialPage) {
    return;
  }

  if (matchesTotpPage(url)) {
    // TOTP challenge means credentials were accepted; keep sidebar in sync with the tab.
    await announceCunyTotpChallenge();
    if (payload.totpSecret.length > 0) {
      const result = await fillTotp(payload.totpSecret);
      if (result.isErr()) log("error:", result.error);
    }
    return;
  }

  log("unrecognised page, doing nothing");
}

async function autoFill(): Promise<void> {
  try {
    const request: AutoFillRequest = { type: "AUTO_FILL_REQUEST" };
    const response = (await browser.runtime.sendMessage(request)) as AutoFillResponse;

    if (!response.success) {
      await handleAutoFillFailureCredentialError(log, response.reason);
      return;
    }
    log("autoFill: credentials received, triggering main()");
    await main(response.payload);
  } catch (autoFillError) {
    log("autoFill: error —", autoFillError);
  }
}

void autoFill();

void requestAndExecuteOverlayCommand();
installAllowConsentClickReporter();

if (matchesTotpEnrollPage(window.location.href)) {
  // Enrollment verify OTP can appear on several RUI URL shapes; see
  // `matchesTotpEnrollPage` / `matchesRuiMfaEnrollVerifyPage` in `ssoSite.ts`.
  startMfaEnrollVerifyOtpPolling();
  startRuiOnboardingObservers();
  void watchTotpSecretOnEnrollPage();
  window.setInterval(() => {
    void requestAndExecuteOverlayCommand();
  }, ENROLL_OVERLAY_REFRESH_INTERVAL_MS);
}

// mfaConsent.jsp: the allow_gate stage is sent on this page load, so the
// sidebar processes it and stores the overlay command shortly after the
// content script starts. Poll until the command arrives and is applied.
if (matchesMfaConsentPage(window.location.href)) {
  window.setInterval(() => {
    void requestAndExecuteOverlayCommand();
  }, ENROLL_OVERLAY_REFRESH_INTERVAL_MS);
}

// Re-export selected helpers for other content-module imports. `CREDENTIAL_ERROR_ELEMENT_ID`
// and `CREDENTIAL_ERROR_TEXT_MARKER` live on `ssoSite` — keep them transitively reachable via
// this module for anyone browsing the content script namespace.
export { CREDENTIAL_ERROR_ELEMENT_ID, CREDENTIAL_ERROR_TEXT_MARKER };

// isFillMessage is only called in the DEV block below; Vite tree-shakes it from
// the production IIFE because import.meta.env.DEV evaluates to false at build time.
if (import.meta.env.DEV) {
  browser.runtime.onMessage.addListener(
    (message: unknown, sender: Runtime.MessageSender) => {
      if (sender?.id !== browser.runtime.id) return;
      if (!isFillMessage(message)) return;
      log("runtime.onMessage FILL_CREDENTIALS — triggering main()");
      void main(message.payload);
    }
  );
}

