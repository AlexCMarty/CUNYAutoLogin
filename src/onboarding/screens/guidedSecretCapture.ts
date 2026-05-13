/**
 * Guided step: student saves the TOTP enrollment secret shown on CUNY.
 * The friendly name is filled from the tab; overlay highlights **Verify Now**
 * because students often miss that control on Oracle RUI.
 */

import browser from "webextension-polyfill";
import {
  PENDING_TOTP_SECRET_SESSION_KEY,
  RUI_ONBOARDING_POLL_INTERVAL_MS,
  RUI_VERIFY_NOW_BTN_TEXT,
  WAIT_FOR_ELEMENT_TIMEOUT_MS,
} from "../../cuny/ssoSite";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import { appendStepProgress, appendTabHint, sendHideOverlayCommand, sendShowOverlayCommand } from "./guidedCommon";

const HEADLINE = "Save this login code in the extension.";
const BODY =
  "The CUNY tab is showing a secret key. We're reading it for you. When you're ready, tap Verify Now on the CUNY tab.";
const TAB_HINT = "We've highlighted the next control on the CUNY tab.";

export const mountGuidedSecretCaptureScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "GUIDED_SECRET_CAPTURE";
  container.className = "onboarding-screen onboarding-screen-guided";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = HEADLINE;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = BODY;

  const secretOk = doc.createElement("p");
  secretOk.dataset.onboardingSecretConfirmed = "true";
  secretOk.className = "onboarding-status";
  secretOk.hidden = true;
  secretOk.textContent = "We captured the secret from the CUNY tab and linked it to this onboarding session.";

  const fiveLimit = doc.createElement("p");
  fiveLimit.dataset.onboardingFiveFactorLimit = "true";
  fiveLimit.className = "onboarding-recovery-message";
  fiveLimit.hidden = true;
  fiveLimit.textContent =
    "CUNY allows at most five Mobile Authenticator factors (limit reached). Remove or rename an existing factor on the CUNY tab before adding another. The extension cannot delete factors for you.";

  const verifyLater = doc.createElement("p");
  verifyLater.dataset.onboardingVerifyLaterRecovery = "true";
  verifyLater.className = "onboarding-recovery-message";
  verifyLater.hidden = true;
  verifyLater.textContent =
    "Your login method was saved but not verified yet. On the CUNY tab, open the menu on the CUNYAutoLogin factor and choose Verify to finish setting it up.";

  const recovery = doc.createElement("p");
  recovery.dataset.onboardingRecoveryMessage = "true";
  recovery.className = "onboarding-recovery-message";
  recovery.hidden = true;
  recovery.textContent =
    "We could not highlight the next control on the CUNY tab. Please follow the steps there manually.";

  container.appendChild(headline);
  container.appendChild(body);
  appendTabHint(doc, container, TAB_HINT);
  container.appendChild(secretOk);
  container.appendChild(fiveLimit);
  container.appendChild(verifyLater);
  container.appendChild(recovery);
  appendStepProgress(doc, container, 5, 8);
  root.appendChild(container);

  sendShowOverlayCommand({
    targetSpec: { type: "a11y", text: RUI_VERIFY_NOW_BTN_TEXT },
    tooltipText: RUI_VERIFY_NOW_BTN_TEXT,
    stepIndex: 5,
    stepTotal: 8,
  });

  const revealIfSecret = (): void => {
    void (async () => {
      try {
        const got = await browser.storage.session?.get(PENDING_TOTP_SECRET_SESSION_KEY);
        const pendingSecret = got?.[PENDING_TOTP_SECRET_SESSION_KEY];
        if (typeof pendingSecret === "string" && pendingSecret.length > 0) {
          secretOk.hidden = false;
        }
      } catch {
        // storage.session unavailable — ignore
      }
    })();
  };
  revealIfSecret();
  const intervalId = window.setInterval(revealIfSecret, RUI_ONBOARDING_POLL_INTERVAL_MS);
  const timeoutId = window.setTimeout(() => {
    window.clearInterval(intervalId);
  }, WAIT_FOR_ELEMENT_TIMEOUT_MS);

  return {
    unmount: () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      sendHideOverlayCommand();
      container.remove();
    },
  };
};
