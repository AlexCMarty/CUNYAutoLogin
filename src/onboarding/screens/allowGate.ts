/**
 * Screen 5 — "Click Allow" gate.
 *
 * On mount we send ONBOARDING_OVERLAY_COMMAND { action: "show" } so the CUNY
 * tab content script can highlight Allow (the student must act in the browser
 * tab, not only in the sidebar).
 *
 * When the overlay cannot find the control, the content script posts stage
 * `target_not_found`; render.ts then reveals the recovery copy below.
 *
 * Back returns to PASSWORD_ENTRY. Forward is implicit: ALLOW_CLICKED advances
 * the machine when the student clicks Allow on CUNY.
 */

import browser from "webextension-polyfill";
import { CUNY_ALLOW_GATE_BTN_SELECTOR } from "../../cuny/ssoSite";
import type { OnboardingOverlayCommand } from "../messages";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_HEADLINE = "One tap on the CUNY tab, then we keep going.";
const SCREEN_BODY =
  "Click Allow on the CUNY tab to continue.";
const DIRECTIONAL_LINE =
  "We've highlighted the button on the CUNY tab.";
const WAITING_LABEL =
  "Waiting for you to finish on the CUNY tab\u2026";
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

  const directional = doc.createElement("p");
  directional.className = "onboarding-directional";
  directional.textContent = DIRECTIONAL_LINE;

  const pulseWrap = doc.createElement("div");
  pulseWrap.className = "onboarding-pulse-wrap";
  pulseWrap.setAttribute("aria-hidden", "true");
  const pulse = doc.createElement("span");
  pulse.className = "onboarding-pulse";
  pulseWrap.appendChild(pulse);

  const waiting = doc.createElement("p");
  waiting.className = "onboarding-waiting-label";
  waiting.textContent = WAITING_LABEL;

  // Hidden until stage `target_not_found` is routed in render.ts, which toggles
  // `[data-onboarding-recovery-message]`.
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
  container.appendChild(directional);
  container.appendChild(pulseWrap);
  container.appendChild(waiting);
  container.appendChild(recovery);
  container.appendChild(actions);
  root.appendChild(container);

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
