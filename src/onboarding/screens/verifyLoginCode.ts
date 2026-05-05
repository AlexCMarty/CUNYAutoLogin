import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import { appendStepProgress, appendTabHint, sendHideOverlayCommand, sendShowOverlayCommand } from "./guidedCommon";
import { RUI_VERIFY_BTN_LABEL } from "../../cuny/ssoSite";

const TAB_HINT = "We've highlighted the next control on the CUNY tab.";

export const mountVerifyLoginCodeScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;
  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "VERIFY_LOGIN_CODE";
  container.className = "onboarding-screen onboarding-screen-guided";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = "We'll fill the code for you.";

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent =
    "The CUNY tab is asking for a six-digit code. We'll type it in. If CUNY rejects two in a row, we'll pause briefly for a fresh code.";

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

  container.append(headline, body);
  appendTabHint(doc, container, TAB_HINT);
  container.append(pause, recovery);
  appendStepProgress(doc, container, 6, 8);
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

