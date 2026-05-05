import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const isPlatformAuthenticatorAvailable = async (): Promise<boolean> => {
  try {
    if (typeof PublicKeyCredential === "undefined") return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

export const mountBiometricOfferScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "BIOMETRIC_OFFER";
  container.className = "onboarding-screen onboarding-screen-biometric-offer";
  root.appendChild(container);

  void (async () => {
    const available = await isPlatformAuthenticatorAvailable();
    if (!available) {
      dispatch("BIOMETRIC_DECLINED");
      return;
    }

    const placeholder = doc.createElement("div");
    placeholder.className = "onboarding-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = "// fingerprint · soft halo";
    placeholder.style.height = "120px";
    container.appendChild(placeholder);

    const h2 = doc.createElement("h2");
    h2.className = "onboarding-headline";
    h2.textContent = "Unlock faster with Face ID or fingerprint.";
    container.appendChild(h2);

    const body = doc.createElement("p");
    body.className = "onboarding-body";
    body.textContent =
      "Use your device's biometrics instead of typing your extension password. Both options are equally safe — pick what fits your setup.";
    container.appendChild(body);

    const useBtn = doc.createElement("button");
    useBtn.type = "button";
    useBtn.className = "onboarding-btn onboarding-btn-primary";
    useBtn.dataset.onboardingBiometricUse = "true";
    useBtn.textContent = "Use Face ID / Fingerprint";
    useBtn.addEventListener("click", () => dispatch("BIOMETRIC_ACCEPTED"));
    container.appendChild(useBtn);

    const skipBtn = doc.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "onboarding-btn onboarding-btn-secondary";
    skipBtn.dataset.onboardingBiometricSkip = "true";
    skipBtn.textContent = "Type my password each time";
    skipBtn.addEventListener("click", () => dispatch("BIOMETRIC_DECLINED"));
    container.appendChild(skipBtn);
  })();

  return { unmount: () => container.remove() };
};
