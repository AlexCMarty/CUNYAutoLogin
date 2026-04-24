/**
 * First guided step on factors list — Manage was auto-opened; student adds a factor next.
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import { sendHideOverlayCommand, sendShowOverlayCommand } from "./guidedCommon";

const HEADLINE = "Add a login code on the CUNY tab";
const BODY =
  "We opened your authentication settings. On the CUNY tab, click **Add Authentication Factor** to continue.";

/** Add control on factors list — highlight the `oj-menu-button` (e2e asserts on host). */
const ADD_MENU_SELECTOR = "oj-menu-button.menu-button";

export const mountGuidedManageScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "GUIDED_MANAGE";
  container.className = "onboarding-screen onboarding-screen-guided";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = HEADLINE;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = BODY;

  const fiveLimit = doc.createElement("p");
  fiveLimit.dataset.onboardingFiveFactorLimit = "true";
  fiveLimit.className = "onboarding-recovery-message";
  fiveLimit.hidden = true;
  fiveLimit.textContent =
    "CUNY allows at most five Mobile Authenticator factors (limit reached). Remove or rename an existing factor on the CUNY tab before adding another. The extension cannot delete factors for you.";

  const verifyLater = doc.createElement("p");
  verifyLater.dataset.onboardingVerifyLaterRecovery = "true";
  verifyLater.className = "onboarding-recovery-message";
  verifyLater.hidden = true;
  verifyLater.textContent =
    "Your login method was saved but not verified yet. On the CUNY tab, open the menu on the CUNYAutoLogin factor and choose Verify to finish setting it up.";

  const recovery = doc.createElement("p");
  recovery.dataset.onboardingRecoveryMessage = "true";
  recovery.className = "onboarding-recovery-message";
  recovery.hidden = true;
  recovery.textContent =
    "We could not highlight the next control on the CUNY tab. Please follow the steps there manually.";

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(fiveLimit);
  container.appendChild(verifyLater);
  container.appendChild(recovery);
  root.appendChild(container);

  sendShowOverlayCommand({
    targetSpec: { type: "css", selector: ADD_MENU_SELECTOR },
    tooltipText: "Click Add Authentication Factor",
    stepIndex: 1,
    stepTotal: 4,
  });

  return {
    unmount: () => {
      sendHideOverlayCommand();
      container.remove();
    },
  };
};
