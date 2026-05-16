import browser from "webextension-polyfill";
import { err, ok, type Result } from "neverthrow";
import {
  CREDENTIAL_INPUT_IDS,
  matchesCredentialErrorUrl,
  matchesCredentialPage,
} from "../cuny/ssoSite";
import type { OnboardingCredentialError, OnboardingStageDetected } from "../onboarding/messages";
import {
  POST_SUBMIT_ERROR_OBSERVE_MS,
  type FillMessage,
  hasCredentialErrorInDom,
  setInputValue,
} from "./content.utils";
import { mountCredentialErrorBanner } from "./banner";
import { waitForElement, waitForInputById } from "./domWait";

let hasSubmitBeenAttempted = false;

const warnRuntimeMessageFailure = (context: string, error: unknown): void => {
  if (import.meta.env.MODE !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[CUNYAutoLogin] credentialFlow: ${context}`, error);
  }
};

/**
 * Notifies the sidebar of a wrong-credential DOM signal and mounts the
 * extension-branded banner so the student notices without looking at the sidebar.
 */
const reportCredentialError = async (): Promise<void> => {
  mountCredentialErrorBanner();
  const message: OnboardingCredentialError = {
    type: "ONBOARDING_CREDENTIAL_ERROR",
    culprit: "password",
  };
  try {
    await browser.runtime.sendMessage(message);
  } catch (error) {
    // Extension reloaded or messaging unavailable — banner still tells the
    // student to look at the sidebar.
    warnRuntimeMessageFailure("reportCredentialError sendMessage", error);
  }
};

/** Tell the sidebar to advance OPENING_CUNY -> CUNY_TOTP (CUNY showed TOTP challenge). */
export const announceCunyTotpChallenge = async (): Promise<void> => {
  const message: OnboardingStageDetected = {
    type: "ONBOARDING_STAGE_DETECTED",
    stage: "cuny_totp_challenge",
  };
  try {
    await browser.runtime.sendMessage(message);
  } catch (error) {
    // Extension reloaded — sidebar may miss this transition.
    warnRuntimeMessageFailure("announceCunyTotpChallenge sendMessage", error);
  }
};

type FillCredentialsError =
  | "username_input_not_found"
  | "password_input_not_found"
  | "submit_button_not_found";

export const fillCredentials = async (
  email: string,
  password: string
): Promise<Result<true, FillCredentialsError>> => {
  const [usernameElm, passwordElm, submitBtn] = await Promise.all([
    waitForInputById(CREDENTIAL_INPUT_IDS.username),
    waitForInputById(CREDENTIAL_INPUT_IDS.password),
    waitForElement(() => {
      const el = document.getElementById(CREDENTIAL_INPUT_IDS.submitButton);
      return el instanceof HTMLButtonElement ? el : null;
    }),
  ]);

  if (!usernameElm) return err("username_input_not_found");
  if (!passwordElm) return err("password_input_not_found");
  if (!submitBtn) return err("submit_button_not_found");

  setInputValue(usernameElm, email);
  setInputValue(passwordElm, password);
  submitBtn.click();
  return ok(true);
};

const watchForPostSubmitCredentialError = (): void => {
  if (hasCredentialErrorInDom(document)) {
    void reportCredentialError();
    return;
  }
  let reported = false;
  const tearDown = (): void => {
    observer.disconnect();
    clearTimeout(timer);
  };
  const observer = new MutationObserver(() => {
    if (reported) return;
    if (!hasCredentialErrorInDom(document)) return;
    reported = true;
    tearDown();
    void reportCredentialError();
  });
  const timer = setTimeout(tearDown, POST_SUBMIT_ERROR_OBSERVE_MS);
  observer.observe(document.documentElement, { childList: true, subtree: true });
};

export const handleCredentialPageFlow = async (
  payload: FillMessage["payload"],
  log: (...args: unknown[]) => void
): Promise<boolean> => {
  const url = window.location.href;

  if (matchesCredentialErrorUrl(url)) {
    log("credential-error URL reached", url);
    hasSubmitBeenAttempted = true;
    if (hasCredentialErrorInDom(document)) {
      await reportCredentialError();
      return true;
    }
    watchForPostSubmitCredentialError();
    return true;
  }

  if (!matchesCredentialPage(url)) {
    return false;
  }

  if (hasCredentialErrorInDom(document)) {
    log("credential-error DOM alert detected on credential URL", url);
    hasSubmitBeenAttempted = true;
    await reportCredentialError();
    return true;
  }
  if (hasSubmitBeenAttempted) {
    log("skipping refill — submit already attempted on this lifetime");
    return true;
  }
  hasSubmitBeenAttempted = true;
  watchForPostSubmitCredentialError();
  const result = await fillCredentials(payload.email, payload.password);
  if (result.isErr()) log("error:", result.error);
  return true;
};

export const handleAutoFillFailureCredentialError = async (
  log: (...args: unknown[]) => void,
  reason:
    | "no_session_master"
    | "no_vault"
    | "decrypt_error"
    | "storage_error"
    | "invalid_sender"
): Promise<void> => {
  log("autoFill:", reason);
  const url = window.location.href;
  const credErrorDom = hasCredentialErrorInDom(document);
  if (credErrorDom && (matchesCredentialErrorUrl(url) || matchesCredentialPage(url))) {
    hasSubmitBeenAttempted = true;
    await reportCredentialError();
  }
};
