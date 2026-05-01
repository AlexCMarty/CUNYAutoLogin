import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_HEADLINE = "One tap on the CUNY tab, then we keep going.";
const SCREEN_BODY =
  "Enter your six-digit code on the CUNY tab to verify it’s you.";
const WAITING_LABEL =
  "Waiting for you to finish the CUNY verification step…";
const BACK_LABEL = "Back";

export const CUNY_TOTP_SCREEN_SELECTOR =
  "[data-onboarding-screen='CUNY_TOTP']";
export const CUNY_TOTP_BACK_SELECTOR =
  "[data-onboarding-cuny-totp-back='true']";

export const mountCunyTotpScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, dispatch } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "CUNY_TOTP";
  container.className = "onboarding-screen onboarding-screen-cuny-totp";

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
  back.dataset.onboardingCunyTotpBack = "true";
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
