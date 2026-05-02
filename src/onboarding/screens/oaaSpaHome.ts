/**
 * SPA home view after Allow — guide student to click Manage.
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import { sendHideOverlayCommand, sendShowOverlayCommand } from "./guidedCommon";

const HEADLINE = "Open your login settings on the CUNY tab";
const BODY =
  "On the CUNY tab, click Manage under My Authentication Factors to continue.";
const MANAGE_SELECTOR = "oj-button#createNewCategory";

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

  sendShowOverlayCommand({
    targetSpec: { type: "css", selector: MANAGE_SELECTOR },
    tooltipText: "Click Manage",
    stepIndex: 1,
    stepTotal: 8,
  });

  return {
    unmount: () => {
      sendHideOverlayCommand();
      container.remove();
    },
  };
};
