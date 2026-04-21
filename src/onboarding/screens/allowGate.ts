/**
 * Screen 5 — "Click Allow" gate (plan-05 detection-only stub).
 *
 * Spec reference: `overhaul-onboarding.md §Screen 5`.
 *
 * Plan-05 delivers the transition *into* this screen (the service-worker
 * bridge dispatches `CREDENTIALS_ACCEPTED` when the content script reports the
 * first post-credential page). The on-CUNY-tab highlight + tooltip overlay,
 * and auto-advance on the real `Allow` click, land in plan-06. Until then we
 * render copy from the spec and a static "look at the CUNY tab" prompt.
 *
 * Back button returns to Screen 3 per spec. No forward button — auto-advance
 * happens via `ALLOW_CLICKED` in a later plan.
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_HEADLINE = "One tap on the CUNY tab, then we keep going.";
const SCREEN_BODY =
  "CUNY is confirming it's really you before showing your account settings. Look for the prompt on the tab and click Allow.";
const WAITING_LABEL =
  "Waiting for you to click Allow on the CUNY tab\u2026";
const BACK_LABEL = "Back";

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
  container.appendChild(actions);
  root.appendChild(container);

  const handleBack = (): void => {
    dispatch("BACK");
  };
  back.addEventListener("click", handleBack);

  return {
    unmount: () => {
      back.removeEventListener("click", handleBack);
      container.remove();
    },
  };
};
