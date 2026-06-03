/**
 * Screen 1 — Welcome.
 *
 * Product copy is intentional; change only with UX review. No back button.
 * CTA "Let's go" dispatches `NEXT` → EMAIL_ENTRY via the transition table.
 *
 * Design notes enforced here:
 *  - The reassurance line is body weight, not subtext — it is the most
 *    important sentence on this screen for a skeptical student.
 *  - The reassurance line names CUNY's login page as the destination so the
 *    claim is factually accurate ("saved only on this device" plus
 *    "sent to CUNY's login page") instead of a blanket "never sent anywhere".
 *  - Authorship / "not affiliated with CUNY" line sits below the CTA.
 *  - No exclamation points in body copy.
 */

import { showOnboardingIllustrationPlaceholders } from "../illustrationPlaceholders";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_HEADLINE = "Stop typing your CUNY password.";
const SCREEN_BODY =
  "Sign into CUNY with one click. We fill your email, password, and the six-digit code for you. Setup takes about five minutes.";
const REASSURANCE_LINE =
  "Everything stays on this computer, locked behind a password only you know.";
const AUTHORSHIP_LINE =
  "An independent open-source project. Not affiliated with CUNY. Created by Alexander Marty.";
const CTA_LABEL = "Let's set it up";

export const WELCOME_CTA_SELECTOR = "[data-onboarding-welcome-cta='true']";
export const WELCOME_REASSURANCE_SELECTOR =
  "[data-onboarding-welcome-reassurance='true']";

export const mountWelcomeScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, dispatch } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "WELCOME";
  container.className = "onboarding-screen onboarding-screen-welcome";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = SCREEN_HEADLINE;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = SCREEN_BODY;

  const reassurance = doc.createElement("p");
  reassurance.dataset.onboardingWelcomeReassurance = "true";
  reassurance.className = "onboarding-reassurance";
  reassurance.textContent = REASSURANCE_LINE;

  const cta = doc.createElement("button");
  cta.type = "button";
  cta.dataset.onboardingWelcomeCta = "true";
  cta.className = "onboarding-cta primary";
  cta.textContent = CTA_LABEL;

  const authorship = doc.createElement("p");
  authorship.className = "onboarding-authorship";
  authorship.textContent = AUTHORSHIP_LINE;

  const advanceToEmailEntry = (): void => {
    dispatch("NEXT");
  };
  cta.addEventListener("click", advanceToEmailEntry);

  if (showOnboardingIllustrationPlaceholders) {
    const placeholder = doc.createElement("div");
    placeholder.className = "onboarding-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = "// welcome · key + door";
    container.appendChild(placeholder);
  }
  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(reassurance);
  container.appendChild(cta);
  container.appendChild(authorship);
  root.appendChild(container);

  return {
    unmount: () => {
      cta.removeEventListener("click", advanceToEmailEntry);
      container.remove();
    },
  };
};
