import { EXTENSION_NAME, WEBAUTHN_RP_ID } from "../../cuny/ssoSite";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const WEBAUTHN_UI_TIMEOUT_MS = 20_000;
const WEBAUTHN_CEREMONY_TIMEOUT_MS = 60_000;

const triggerPlatformAuthenticator = async (): Promise<"success" | "failed" | "timed_out"> => {
  const abortController = new AbortController();
  const timeoutHandle = window.setTimeout(() => abortController.abort(), WEBAUTHN_UI_TIMEOUT_MS);

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const createOptions: CredentialCreationOptions = {
      publicKey: {
        challenge,
        rp: { name: EXTENSION_NAME, id: WEBAUTHN_RP_ID },
        user: { id: userId, name: "cuny-user", displayName: "CUNY User" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // COSE ES256 (ECDSA P-256)
          { type: "public-key", alg: -257 }, // COSE RS256 (RSA PKCS#1 v1.5)
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
        attestation: "none",
        timeout: WEBAUTHN_CEREMONY_TIMEOUT_MS,
      },
      signal: abortController.signal,
    };
    await navigator.credentials.create(createOptions);
    return "success";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "timed_out";
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[CUNYAutoLogin] WebAuthn create failed", error);
    }
    return "failed";
  } finally {
    window.clearTimeout(timeoutHandle);
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
    "Your browser is about to ask for permission to use your fingerprint or face. This is handled by your device — not by us.";
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
    statusMsg.textContent =
      result === "timed_out"
        ? "We couldn't start your device's biometric prompt from this panel. You can continue with your extension password."
        : "No problem — you'll use your extension password to unlock.";
    backBtn.hidden = false;
    continueBtn.disabled = false;
    continueBtn.textContent = "Continue anyway";
    fallbackMode = true;
  });

  root.appendChild(container);
  return { unmount: () => container.remove() };
};
