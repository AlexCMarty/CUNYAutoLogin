import browser from "webextension-polyfill";
import { CUNY_ALLOW_GATE_BTN_SELECTOR } from "../cuny/ssoSite";
import type { OnboardingStageDetected } from "../onboarding/messages";

/**
 * OAuth consent (Allow) — report click so the sidebar can leave ALLOW_GATE even
 * when the fixture does not navigate (no `?next=`).
 */
export const installAllowConsentClickReporter = (): void => {
  const href = window.location.href;
  if (!href.includes("mfaConsent")) return;
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(CUNY_ALLOW_GATE_BTN_SELECTOR)) return;
      const message: OnboardingStageDetected = {
        type: "ONBOARDING_STAGE_DETECTED",
        stage: "allow_button_clicked",
      };
      void browser.runtime.sendMessage(message).catch(() => undefined);
    },
    true
  );
};
