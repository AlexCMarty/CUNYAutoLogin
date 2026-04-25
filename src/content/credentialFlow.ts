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

let submitAttempted = false;

/**
 * Plan-05 hook: tell the sidebar that we just detected a wrong-credential
 * state on the CUNY page AND show the extension-branded banner so the student
 * notices even without looking at the sidebar.
 */
export const reportCredentialError = async (): Promise<void> => {
  mountCredentialErrorBanner();
  const message: OnboardingCredentialError = {
    type: "ONBOARDING_CREDENTIAL_ERROR",
    culprit: "password",
  };
  try {
    await browser.runtime.sendMessage(message);
  } catch {
    // Extension reloaded or messaging unavailable — banner still tells the
    // student to look at the sidebar.
  }
};

/** Plan-05 hook: tell the sidebar to advance OPENING_CUNY -> ALLOW_GATE. */
export const announceCredentialsAccepted = async (): Promise<void> => {
  const message: OnboardingStageDetected = {
    type: "ONBOARDING_STAGE_DETECTED",
    stage: "allow_gate",
  };
  try {
    await browser.runtime.sendMessage(message);
  } catch {
    // Extension reloaded — sidebar may miss this transition.
  }
};

export const fillCredentials = async (
  email: string,
  password: string
): Promise<Result<true, string>> => {
  const [usernameElm, passwordElm, submitBtn] = await Promise.all([
    waitForInputById(CREDENTIAL_INPUT_IDS.username),
    waitForInputById(CREDENTIAL_INPUT_IDS.password),
    waitForElement(() => {
      const el = document.getElementById(CREDENTIAL_INPUT_IDS.submitButton);
      return el instanceof HTMLButtonElement ? el : null;
    }),
  ]);

  if (!usernameElm) return err("credential page: username input not found");
  if (!passwordElm) return err("credential page: password input not found");
  if (!submitBtn) return err("credential page: submit button not found");

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
    submitAttempted = true;
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
    submitAttempted = true;
    await reportCredentialError();
    return true;
  }
  if (submitAttempted) {
    log("skipping refill — submit already attempted on this lifetime");
    return true;
  }
  submitAttempted = true;
  watchForPostSubmitCredentialError();
  const result = await fillCredentials(payload.email, payload.password);
  if (result.isErr()) log("error:", result.error);
  return true;
};

export const handleAutoFillFailureCredentialError = async (
  log: (...args: unknown[]) => void,
  reason: string
): Promise<void> => {
  log("autoFill:", reason);
  const url = window.location.href;
  const credErrorDom = hasCredentialErrorInDom(document);
  if (credErrorDom && (matchesCredentialErrorUrl(url) || matchesCredentialPage(url))) {
    submitAttempted = true;
    await reportCredentialError();
  }
};
