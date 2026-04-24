/**
 * Plan-07 stub — full verify flow is plan-08. Exposes screen marker for e2e.
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

export const mountVerifyLoginCodeStubScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;
  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "VERIFY_LOGIN_CODE";
  container.className = "onboarding-screen onboarding-screen-verify-stub";
  const p = doc.createElement("p");
  p.className = "onboarding-body";
  p.textContent = "Enter the verification code on the CUNY tab (details in a later plan).";
  container.appendChild(p);
  root.appendChild(container);
  return { unmount: () => container.remove() };
};
