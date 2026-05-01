/**
 * Screen 5 — "Click Allow" gate.
 *
 * Plan-05 delivered the transition into this screen. Plan-06 adds:
 *   - ONBOARDING_OVERLAY_COMMAND { action: "show" } sent on mount so the
 *     content script highlights the Allow button on the CUNY tab.
 *   - Recovery message div shown when TARGET_NOT_FOUND is reported back.
 *
 * Back button returns to Screen 3 per spec. No forward button — auto-advance
 * happens via ALLOW_CLICKED in a later plan.
 */

import browser from "webextension-polyfill";
import { CUNY_ALLOW_GATE_BTN_SELECTOR } from "../../cuny/ssoSite";
import type { OnboardingOverlayCommand } from "../messages";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_HEADLINE = "One tap on the CUNY tab, then we keep going.";
const SCREEN_BODY =
  "Enter your six-digit code on the CUNY tab to verify it's you. If CUNY then asks for consent, click Allow.";
const WAITING_LABEL =
  "Waiting for you to finish the CUNY verification step\u2026";
const RECOVERY_COPY =
  "We couldn\u2019t find the Allow button. Please check the CUNY tab and click Allow manually, or go back and try again.";
const BACK_LABEL = "Back";

const ALLOW_TOOLTIP = "Click Allow to continue";
const ALLOW_STEP_INDEX = 1;
const ALLOW_STEP_TOTAL = 1;

const sendShowOverlayCommand = (): void => {
  const command: OnboardingOverlayCommand = {
    type: "ONBOARDING_OVERLAY_COMMAND",
    action: "show",
    targetSpec: { type: "css", selector: CUNY_ALLOW_GATE_BTN_SELECTOR },
    tooltipText: ALLOW_TOOLTIP,
    stepIndex: ALLOW_STEP_INDEX,
    stepTotal: ALLOW_STEP_TOTAL,
  };
  void browser.runtime.sendMessage(command).catch(() => {
    // Service worker may be inactive \u2014 overlay will appear when content script
    // polls on next page load.
  });
};

const sendHideOverlayCommand = (): void => {
  const command: OnboardingOverlayCommand = {
    type: "ONBOARDING_OVERLAY_COMMAND",
    action: "hide",
  };
  void browser.runtime.sendMessage(command).catch(() => undefined);
};

export const ALLOW_GATE_SCREEN_SELECTOR =
  "[data-onboarding-screen='ALLOW_GATE']";
export const ALLOW_GATE_BACK_SELECTOR =
  "[data-onboarding-allow-back='true']";

export const mountAllowGateScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, dispatch } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "ALLOW_GATE";
  container.className = "onboarding-screen onboarding-screen-allow-gate";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = SCREEN_HEADLINE;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = SCREEN_BODY;

  const waiting = doc.createElement("p");
  waiting.className = "onboarding-waiting-label";
  waiting.textContent = WAITING_LABEL;

  // Recovery message — hidden until TARGET_NOT_FOUND is received from the
  // content script. render.ts un-hides it via [data-onboarding-recovery-message].
  const recovery = doc.createElement("p");
  recovery.dataset.onboardingRecoveryMessage = "true";
  recovery.className = "onboarding-recovery-message";
  recovery.textContent = RECOVERY_COPY;
  recovery.hidden = true;

  const back = doc.createElement("button");
  back.type = "button";
  back.dataset.onboardingAllowBack = "true";
  back.className = "onboarding-back secondary";
  back.textContent = BACK_LABEL;

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions onboarding-actions-single";
  actions.appendChild(back);

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(waiting);
  container.appendChild(recovery);
  container.appendChild(actions);
  root.appendChild(container);

  // Tell the content script to highlight the Allow button on the CUNY tab.
  sendShowOverlayCommand();

  const handleBack = (): void => {
    dispatch("BACK");
  };
  back.addEventListener("click", handleBack);

  return {
    unmount: () => {
      back.removeEventListener("click", handleBack);
      sendHideOverlayCommand();
      container.remove();
    },
  };
};
