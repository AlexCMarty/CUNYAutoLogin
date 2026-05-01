import browser from "webextension-polyfill";
import {
  RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID,
  RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS,
  RUI_MFA_INLINE_ERROR_SELECTOR,
  RUI_VERIFY_BTN_LABEL,
  RUI_CLIENT_OTP_ERROR,
  RUI_SERVER_OTP_ERROR,
} from "../cuny/ssoSite";
import type { AutoFillRequest, AutoFillResponse, OnboardingVerifyStatus } from "../onboarding/messages";
import { simulateKeystrokes } from "./content.utils";
import { getOtp } from "./totpLoginFlow";

const LOG_PREFIX = "[CUNYAutoLogin]";

const log = (...args: unknown[]): void => {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.log(LOG_PREFIX, "MFA self-service · TOTP verify:", ...args);
};

const findVerifyAndSaveButton = (): HTMLButtonElement | null =>
  (Array.from(document.querySelectorAll("button")).find((button) =>
    (button.textContent ?? "").includes(RUI_VERIFY_BTN_LABEL)
  ) as HTMLButtonElement | undefined) ?? null;

const readInlineVerifyError = (): string =>
  (
    document.querySelector(RUI_MFA_INLINE_ERROR_SELECTOR)
      ?.textContent ?? ""
  ).trim();

const sendVerifyStatus = (status: OnboardingVerifyStatus["status"]): void => {
  const message: OnboardingVerifyStatus = {
    type: "ONBOARDING_VERIFY_STATUS",
    status,
  };
  void browser.runtime.sendMessage(message).catch(() => undefined);
};

const isAutoFillResponse = (value: unknown): value is AutoFillResponse =>
  typeof value === "object" && value !== null && "success" in value;

const tryFillMfaEnrollVerifyOtp = async (otpInput: HTMLInputElement): Promise<boolean> => {
  try {
    const request: AutoFillRequest = {
      type: "AUTO_FILL_REQUEST",
      otpContext: "enroll_verify",
    };
    const raw = await browser.runtime.sendMessage(request);
    if (!isAutoFillResponse(raw)) return false;
    const response = raw;

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
    // eslint-disable-next-line no-console
    console.warn("[CUNYAutoLogin] mfaEnrollVerifyFlow tick: unexpected error", error);
    return false;
  }
};

type MfaEnrollState = {
  otpFilled: boolean;
  verifyAttemptCount: number;
  secondFailureAnnounced: boolean;
  shouldAutoSubmit: boolean;
  automationPaused: boolean;
  vaultRequestInFlight: boolean;
  loggedOtpFieldFound: boolean;
};

const tickMfaEnrollVerify = async (
  state: MfaEnrollState,
  stopPolling: () => void
): Promise<void> => {
  const currentError = readInlineVerifyError();
  if (currentError.includes(RUI_CLIENT_OTP_ERROR)) {
    state.automationPaused = true;
    log("client-side validation error; waiting for user action");
    stopPolling();
    return;
  }
  if (state.otpFilled) {
    const errorText = currentError;
    if (errorText.includes(RUI_SERVER_OTP_ERROR)) {
      if (state.verifyAttemptCount === 0) {
        state.verifyAttemptCount = 1;
        state.otpFilled = false;
        sendVerifyStatus("first_failure");
        log("server-side incorrect code; triggering one auto-retry");
        return;
      }
      if (!state.secondFailureAnnounced) {
        state.secondFailureAnnounced = true;
        state.automationPaused = true;
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

  if (!state.loggedOtpFieldFound) {
    state.loggedOtpFieldFound = true;
    log("found verify OTP field", otpField);
  }

  if (state.vaultRequestInFlight || state.automationPaused) {
    return;
  }

  state.vaultRequestInFlight = true;
  const didFill = await tryFillMfaEnrollVerifyOtp(otpField);
  state.vaultRequestInFlight = false;
  if (didFill) {
    sendVerifyStatus("pending");
    if (state.shouldAutoSubmit) {
      const verifyBtn = findVerifyAndSaveButton();
      verifyBtn?.click();
    }
    state.otpFilled = true;
  }
};

export const startMfaEnrollVerifyOtpPolling = (): void => {
  log(
    "polling every",
    RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS,
    "ms — SPA keeps one URL on this flow; the OTP field appears only after Verify Now, so we poll instead of MutationObserver"
  );

  let shouldAutoSubmit = false;
  try {
    shouldAutoSubmit = new URL(window.location.href).searchParams.get("wrongCode") === "1";
  } catch {
    shouldAutoSubmit = false;
  }

  const state: MfaEnrollState = {
    otpFilled: false,
    verifyAttemptCount: 0,
    secondFailureAnnounced: false,
    shouldAutoSubmit,
    automationPaused: false,
    vaultRequestInFlight: false,
    loggedOtpFieldFound: false,
  };

  let pollIntervalId: number | null = null;
  const stopPolling = (): void => {
    if (pollIntervalId !== null) {
      window.clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  };

  pollIntervalId = window.setInterval(
    () => { void tickMfaEnrollVerify(state, stopPolling); },
    RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS
  );
};
