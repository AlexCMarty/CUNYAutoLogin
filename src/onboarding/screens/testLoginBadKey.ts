/**
 * TEST_LOGIN_BAD_KEY — the test login failed because the pasted key produced an
 * invalid code (bead 3). Usually a typo or a character clipped off the end
 * (advanced-key-flow.md §7).
 *
 * VISUALS-ONLY PASS: buttons are inert. The wiring pass dispatches RETRY_KEY
 * (→ back to whichever paste page the user started on, resolved from
 * keyEntryOrigin) and SWITCH_TO_GUIDED (→ OPENING_CUNY, enroll fresh).
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const HEADLINE = "That key didn't work.";
const BODY =
  "The key you pasted didn't produce a valid code. Look for a typo, or a " +
  "character missing from the end.";
const RETRY_LABEL = "Re-enter key";
const SWITCH_LABEL = "Set up a new code instead";

export const mountTestLoginBadKeyScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "TEST_LOGIN_BAD_KEY";
  container.className = "onboarding-screen onboarding-screen-test-bad-key";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = HEADLINE;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = BODY;

  const hint = doc.createElement("p");
  hint.className = "onboarding-inline-hint";
  hint.appendChild(doc.createTextNode("Copy the "));
  const whole = doc.createElement("strong");
  whole.textContent = "whole";
  hint.appendChild(whole);
  hint.appendChild(doc.createTextNode(" key — no spaces, and nothing cut off."));

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions";
  actions.style.flexDirection = "column";
  actions.style.gap = "8px";

  const retry = doc.createElement("button");
  retry.type = "button";
  retry.dataset.onboardingBadKeyRetry = "true";
  retry.className = "onboarding-btn onboarding-btn-primary";
  retry.textContent = RETRY_LABEL;

  const switchGuided = doc.createElement("button");
  switchGuided.type = "button";
  switchGuided.dataset.onboardingBadKeySwitch = "true";
  switchGuided.className = "onboarding-btn onboarding-btn-secondary";
  switchGuided.textContent = SWITCH_LABEL;

  actions.appendChild(retry);
  actions.appendChild(switchGuided);

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(hint);
  container.appendChild(actions);
  root.appendChild(container);

  return {
    unmount: () => {
      container.remove();
    },
  };
};
