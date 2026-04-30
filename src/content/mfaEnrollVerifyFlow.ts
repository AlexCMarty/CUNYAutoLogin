import browser from "webextension-polyfill";
import {
  RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID,
  RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS,
} from "../cuny/ssoSite";
import type { AutoFillRequest, AutoFillResponse, OnboardingVerifyStatus } from "../onboarding/messages";
import { simulateKeystrokes } from "./content.utils";
import { getOtp } from "./totpLoginFlow";

const VERIFY_AND_SAVE_LABEL = "Verify and Save";
const CLIENT_VERIFY_ERROR_TEXT = "Enter a OTP code";
const SERVER_VERIFY_ERROR_TEXT = "Incorrect code";
const LOG_PREFIX = "[CUNYAutoLogin]";

const log = (...args: unknown[]): void => {
  if (!import.meta.env.DEV) return;
  console.log(LOG_PREFIX, "MFA self-service · TOTP verify:", ...args);
};

const findVerifyAndSaveButton = (): HTMLButtonElement | null =>
  (Array.from(document.querySelectorAll("button")).find((button) =>
    (button.textContent ?? "").includes(VERIFY_AND_SAVE_LABEL)
  ) as HTMLButtonElement | undefined) ?? null;

const readInlineVerifyError = (): string =>
  (
    document.querySelector(".oj-messaging-inline-container .oj-message-detail")
      ?.textContent ?? ""
  ).trim();

const sendVerifyStatus = (status: OnboardingVerifyStatus["status"]): void => {
  const message: OnboardingVerifyStatus = {
    type: "ONBOARDING_VERIFY_STATUS",
    status,
  };
  void browser.runtime.sendMessage(message).catch(() => undefined);
};

const tryFillMfaEnrollVerifyOtp = async (otpInput: HTMLInputElement): Promise<boolean> => {
  try {
    const request: AutoFillRequest = {
      type: "AUTO_FILL_REQUEST",
      otpContext: "enroll_verify",
    };
    const response = (await browser.runtime.sendMessage(request)) as AutoFillResponse;

    if (!response.success) {
      if (response.reason === "no_session_master") {
        log("vault locked — unlock the extension sidebar to fill the 6-digit code");
      } else if (response.reason === "no_vault") {
        log("vault not set up — save credentials in the extension first");
      } else {
        log("cannot read vault:", response.reason);
      }
      return false;
    }

    if (response.payload.totpSecret.length === 0) {
      log("no TOTP secret available yet — still in onboarding");
      return false;
    }
    const otp = await getOtp(response.payload.totpSecret);
    simulateKeystrokes(otpInput, otp);
    log("filled 6-digit code");
    return true;
  } catch (error) {
    log("error —", error);
    return false;
  }
};

export const startMfaEnrollVerifyOtpPolling = (): void => {
  log(
    "polling every",
    RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS,
    "ms — SPA keeps one URL on this flow; the OTP field appears only after Verify Now, so we poll instead of MutationObserver"
  );
  let otpFilled = false;
  let verifyAttemptCount = 0;
  let secondFailureAnnounced = false;
  let automationPaused = false;
  let vaultRequestInFlight = false;
  let loggedOtpFieldFound = false;
  let shouldAutoSubmit = false;
  try {
    shouldAutoSubmit = new URL(window.location.href).searchParams.get("wrongCode") === "1";
  } catch {
    shouldAutoSubmit = false;
  }
  let pollIntervalId: number | null = null;
  const stopPolling = (): void => {
    if (pollIntervalId !== null) {
      window.clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  };
  pollIntervalId = window.setInterval(() => {
    const currentError = readInlineVerifyError();
    if (currentError.includes(CLIENT_VERIFY_ERROR_TEXT)) {
      automationPaused = true;
      log("client-side validation error; waiting for user action");
      stopPolling();
      return;
    }
    if (otpFilled) {
      const errorText = currentError;
      if (errorText.includes(SERVER_VERIFY_ERROR_TEXT)) {
        if (verifyAttemptCount === 0) {
          verifyAttemptCount = 1;
          otpFilled = false;
          sendVerifyStatus("first_failure");
          log("server-side incorrect code; triggering one auto-retry");
          return;
        }
        if (!secondFailureAnnounced) {
          secondFailureAnnounced = true;
          automationPaused = true;
          sendVerifyStatus("second_failure");
          log("second server-side failure; pausing retries");
          stopPolling();
        }
        return;
      }
      return;
    }

    const otpField = document.getElementById(RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID);
    if (!(otpField instanceof HTMLInputElement)) {
      return;
    }

    if (!loggedOtpFieldFound) {
      loggedOtpFieldFound = true;
      log("found verify OTP field", otpField);
    }

    if (vaultRequestInFlight || automationPaused) {
      return;
    }

    vaultRequestInFlight = true;
    void tryFillMfaEnrollVerifyOtp(otpField).then((didFill) => {
      vaultRequestInFlight = false;
      if (didFill) {
        sendVerifyStatus("pending");
        if (shouldAutoSubmit) {
          const verifyBtn = findVerifyAndSaveButton();
          verifyBtn?.click();
        }
        otpFilled = true;
      }
    });
  }, RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS);
};
