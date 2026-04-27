import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

export const mountBiometricOfferStubScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;
  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "BIOMETRIC_OFFER";
  container.className = "onboarding-screen onboarding-screen-biometric-stub";

  const p = doc.createElement("p");
  p.className = "onboarding-body";
  p.textContent = "Biometric offer (full step lands in plan 10).";
  container.appendChild(p);

  root.appendChild(container);
  return { unmount: () => container.remove() };
};
