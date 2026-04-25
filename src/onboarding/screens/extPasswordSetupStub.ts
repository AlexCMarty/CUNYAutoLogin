import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

export const mountExtPasswordSetupStubScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;
  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "EXT_PASSWORD_SETUP";
  container.className = "onboarding-screen onboarding-screen-verify-stub";

  const p = doc.createElement("p");
  p.className = "onboarding-body";
  p.textContent = "Create your extension password (full step lands in a later plan).";
  container.appendChild(p);
  root.appendChild(container);

  return { unmount: () => container.remove() };
};
