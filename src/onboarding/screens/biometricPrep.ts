import { EXTENSION_NAME } from "../../cuny/ssoSite";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const triggerPlatformAuthenticator = async (): Promise<"success" | "failed"> => {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: EXTENSION_NAME },
        user: { id: userId, name: "cuny-user", displayName: "CUNY User" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // COSE ES256 (ECDSA P-256)
          { type: "public-key", alg: -257 }, // COSE RS256 (RSA PKCS#1 v1.5)
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60_000,
      },
    });
    return "success";
  } catch {
    return "failed";
  }
};

export const mountBiometricPrepScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "BIOMETRIC_PREP";
  container.className = "onboarding-screen onboarding-screen-biometric-prep";

  const h2 = doc.createElement("h2");
  h2.className = "onboarding-headline";
  h2.textContent = "One more thing";
  container.appendChild(h2);

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent =
    "Your browser is about to ask for permission to use your fingerprint or face. This is handled by your device -- not by us.";
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

    const result = await triggerPlatformAuthenticator();
    if (result === "success") {
      dispatch("BIOMETRIC_PREP_DONE");
      return;
    }

    statusMsg.hidden = false;
    statusMsg.textContent = "No problem -- you'll use your extension password to unlock.";
    continueBtn.disabled = false;
    continueBtn.textContent = "Continue anyway";
    fallbackMode = true;
  });

  root.appendChild(container);
  return { unmount: () => container.remove() };
};
