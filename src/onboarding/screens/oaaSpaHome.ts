/**
 * SPA home view after Allow — guide student to click Manage.
 */

import { RUI_MANAGE_BTN_SELECTOR } from "../../cuny/ssoSite";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import { appendStepProgress, appendTabHint, sendHideOverlayCommand, sendShowOverlayCommand } from "./guidedCommon";

const HEADLINE = "Open your login settings on the CUNY tab.";
const BODY =
  "On the CUNY tab, click Manage under My Authentication Factors to continue.";
const TAB_HINT = "We've highlighted the next control on the CUNY tab.";

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
  appendTabHint(doc, container, TAB_HINT);
  container.appendChild(loading);
  appendStepProgress(doc, container, 1, 8);
  root.appendChild(container);

  sendShowOverlayCommand({
    targetSpec: { type: "css", selector: RUI_MANAGE_BTN_SELECTOR },
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
