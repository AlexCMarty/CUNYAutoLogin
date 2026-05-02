import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import { sendHideOverlayCommand, sendShowOverlayCommand } from "./guidedCommon";
import { RUI_VERIFY_BTN_LABEL } from "../../cuny/ssoSite";

export const mountVerifyLoginCodeScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;
  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "VERIFY_LOGIN_CODE";
  container.className = "onboarding-screen onboarding-screen-guided";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = "Enter your six-digit code";

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent =
    "We will fill the code on the CUNY tab. If CUNY rejects it twice, pause and wait for a fresh code before trying again.";

  const pause = doc.createElement("p");
  pause.dataset.onboardingVerifyPause = "true";
  pause.className = "onboarding-recovery-message";
  pause.hidden = true;
  pause.textContent =
    "Please wait a moment before trying again. CUNY rejected two codes in a row, so automatic retries are paused.";

  const recovery = doc.createElement("p");
  recovery.dataset.onboardingRecoveryMessage = "true";
  recovery.className = "onboarding-recovery-message";
  recovery.hidden = true;
  recovery.textContent =
    "We could not find the verify controls on the CUNY tab. Enter the code manually and click Verify and Save.";

  container.append(headline, body, pause, recovery);
  root.appendChild(container);

  sendShowOverlayCommand({
    targetSpec: { type: "a11y", text: RUI_VERIFY_BTN_LABEL },
    tooltipText: "Click to save your code",
    stepIndex: 6,
    stepTotal: 8,
  });

  return {
    unmount: () => {
      sendHideOverlayCommand();
      container.remove();
    },
  };
};

