import browser from "webextension-polyfill";
import { SESSION_MASTER_KEY } from "../../cuny/ssoSite";
import { enrollBiometric, type BiometricError } from "../../crypto/biometric";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const fallbackMessage = (error: BiometricError): string => {
  if (error === "user_cancelled") {
    return "Didn't catch that — tap Continue to try again, or go back.";
  }
  if (error === "prf_unavailable" || error === "unsupported_browser") {
    return "Your browser or device doesn’t support biometric unlock. You’ll use your extension password instead.";
  }
  return "Something went wrong. You’ll use your extension password instead.";
};

export const mountBiometricPrepScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "BIOMETRIC_PREP";
  container.className = "onboarding-screen onboarding-screen-biometric-prep";

  const h2 = doc.createElement("h2");
  h2.className = "onboarding-headline";
  h2.textContent = "Set up biometric unlock";
  container.appendChild(h2);

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent =
    "Your browser will prompt you twice — once to register, once to confirm. Both gestures stay on your device.";
  container.appendChild(body);

  const statusMsg = doc.createElement("p");
  statusMsg.className = "onboarding-subtext";
  statusMsg.hidden = true;
  container.appendChild(statusMsg);

  const continueBtn = doc.createElement("button");
  continueBtn.type = "button";
  continueBtn.className = "onboarding-btn onboarding-btn-primary";
  continueBtn.dataset.onboardingBiometricPrepContinue = "true";
  continueBtn.textContent = "Continue";
  container.appendChild(continueBtn);

  const backBtn = doc.createElement("button");
  backBtn.type = "button";
  backBtn.className = "onboarding-btn onboarding-btn-link";
  backBtn.dataset.onboardingBack = "true";
  backBtn.textContent = "Go back";
  backBtn.addEventListener("click", () => dispatch("BACK"));
  container.appendChild(backBtn);

  let fallbackMode = false;

  continueBtn.addEventListener("click", async () => {
    if (fallbackMode) {
      dispatch("BIOMETRIC_PREP_DONE");
      return;
    }

    continueBtn.disabled = true;
    backBtn.hidden = true;
    statusMsg.hidden = true;

    // Master password is written to session storage by extPasswordSetup.ts
    // immediately before this state is entered.
    let masterPassword: string | null = null;
    try {
      const sessionData = await browser.storage.session?.get(SESSION_MASTER_KEY);
      const candidate = sessionData?.[SESSION_MASTER_KEY];
      if (typeof candidate === "string") masterPassword = candidate;
    } catch {
      /* storage.session unavailable — fallback to null */
    }

    if (!masterPassword) {
      statusMsg.hidden = false;
      statusMsg.textContent =
        "Could not read your extension password from the session. Go back and re-enter it.";
      backBtn.hidden = false;
      continueBtn.disabled = false;
      continueBtn.textContent = "Continue anyway";
      fallbackMode = true;
      return;
    }

    const result = await enrollBiometric(masterPassword);

    if (result.isOk()) {
      dispatch("BIOMETRIC_PREP_DONE");
      return;
    }

    const message = fallbackMessage(result.error);
    statusMsg.hidden = false;
    statusMsg.textContent = message;
    backBtn.hidden = false;
    continueBtn.disabled = false;

    if (result.error === "user_cancelled") {
      // Let the user retry without entering fallback mode
      return;
    }

    continueBtn.textContent = "Continue anyway";
    fallbackMode = true;
  });

  root.appendChild(container);
  return { unmount: () => container.remove() };
};
