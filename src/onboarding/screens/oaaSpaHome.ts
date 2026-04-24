/**
 * SPA home view after Allow — waiting for Manage auto-click and factor panels.
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const HEADLINE = "Opening your login settings\u2026";
const BODY =
  "Hang on while we open the CUNY page where you add login codes. You do not need to click anything yet.";

export const mountOaaSpaHomeScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "OAA_SPA_HOME";
  container.className = "onboarding-screen onboarding-screen-oaa-spa-home";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = HEADLINE;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = BODY;

  const loading = doc.createElement("p");
  loading.dataset.onboardingOaaHomeLoading = "true";
  loading.className = "onboarding-waiting-label";
  loading.textContent = "Waiting for your factors list to load on the CUNY tab\u2026";

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(loading);
  root.appendChild(container);

  return {
    unmount: () => {
      container.remove();
    },
  };
};
