import browser from "webextension-polyfill";
import { PENDING_TOTP_SECRET_SESSION_KEY, SESSION_MASTER_KEY } from "../../cuny/ssoSite";
import { VAULT_STORAGE_KEY, encryptVault } from "../../crypto/vault";
import { MIN_MASTER_PASSWORD_LENGTH } from "../../sidebar/sidebar.utils";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

export type PasswordStrength = "Weak" | "Fair" | "Strong";

/** Passwords up to this length are considered Weak regardless of variety. */
const WEAK_PASSWORD_MAX_LENGTH = 8;

export const computePasswordStrength = (pw: string): PasswordStrength => {
  if (pw.length < WEAK_PASSWORD_MAX_LENGTH) return "Weak";
  const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]
    .filter((re) => re.test(pw)).length;
  if (variety < 3) return "Weak";
  if (pw.length >= MIN_MASTER_PASSWORD_LENGTH) return "Strong";
  return "Fair";
};

// eslint-disable-next-line max-lines-per-function
export const mountExtPasswordSetupScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch, getSnapshot } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "EXT_PASSWORD_SETUP";
  container.className = "onboarding-screen onboarding-screen-ext-password";

  const h2 = doc.createElement("h2");
  h2.className = "onboarding-headline";
  h2.textContent = "Create your extension password";
  container.appendChild(h2);

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent =
    "This is separate from your CUNY password — it locks what we just saved on your device. Pick something different from your CUNY password.";
  container.appendChild(body);

  const recovery = doc.createElement("p");
  recovery.className = "onboarding-subtext";
  recovery.textContent =
    "If you forget this password, just run setup again — it takes about 5 minutes.";
  container.appendChild(recovery);

  // Password input + strength indicator
  const pwLabel = doc.createElement("label");
  pwLabel.className = "onboarding-field-label";
  pwLabel.textContent = "Choose a password";
  container.appendChild(pwLabel);

  const pwInput = doc.createElement("input");
  pwInput.type = "password";
  pwInput.className = "onboarding-input";
  pwInput.dataset.onboardingExtPasswordInput = "true";
  pwInput.autocomplete = "new-password";
  container.appendChild(pwInput);

  const strengthSpan = doc.createElement("span");
  strengthSpan.className = "onboarding-ext-password-strength";
  strengthSpan.dataset.onboardingExtPasswordStrength = "true";
  container.appendChild(strengthSpan);

  // Confirm input + match indicator
  const confirmLabel = doc.createElement("label");
  confirmLabel.className = "onboarding-field-label";
  confirmLabel.textContent = "Confirm password";
  container.appendChild(confirmLabel);

  const confirmInput = doc.createElement("input");
  confirmInput.type = "password";
  confirmInput.className = "onboarding-input";
  confirmInput.dataset.onboardingExtPasswordConfirm = "true";
  confirmInput.autocomplete = "new-password";
  container.appendChild(confirmInput);

  const matchIndicator = doc.createElement("span");
  matchIndicator.className = "onboarding-ext-password-match";
  matchIndicator.dataset.onboardingExtPasswordMatchIndicator = "true";
  matchIndicator.hidden = true;
  container.appendChild(matchIndicator);

  // Error message (shown on vault save failure)
  const errorMsg = doc.createElement("p");
  errorMsg.className = "onboarding-error onboarding-ext-password-error";
  errorMsg.hidden = true;
  errorMsg.textContent = "Something went wrong saving your password. Please try again.";
  container.appendChild(errorMsg);

  // Forward button
  const forwardBtn = doc.createElement("button");
  forwardBtn.type = "button";
  forwardBtn.className = "onboarding-btn onboarding-btn-primary";
  forwardBtn.dataset.onboardingExtPasswordForward = "true";
  forwardBtn.textContent = "Set my extension password";
  forwardBtn.disabled = true;
  container.appendChild(forwardBtn);

  const syncValidation = (): void => {
    const pw = pwInput.value;
    const confirm = confirmInput.value;
    const strength = computePasswordStrength(pw);

    strengthSpan.textContent = pw.length > 0 ? strength : "";

    if (confirm.length > 0) {
      const matches = pw === confirm;
      matchIndicator.hidden = false;
      matchIndicator.textContent = matches ? "Passwords match" : "Passwords do not match";
      matchIndicator.dataset.matchOk = matches ? "true" : "false";
    } else {
      matchIndicator.hidden = true;
      matchIndicator.textContent = "";
    }

    const canAdvance =
      strength !== "Weak" && pw.length > 0 && confirm.length > 0 && pw === confirm;
    forwardBtn.disabled = !canAdvance;
  };

  pwInput.addEventListener("input", syncValidation);
  confirmInput.addEventListener("input", syncValidation);

  forwardBtn.addEventListener("click", () => {
    const extensionPassword = pwInput.value;
    forwardBtn.disabled = true;
    errorMsg.hidden = true;

    void (async () => {
      try {
        const { email, password } = getSnapshot();
        const sessionResult = await browser.storage.session?.get(
          PENDING_TOTP_SECRET_SESSION_KEY
        );
        const rawSecret = sessionResult?.[PENDING_TOTP_SECRET_SESSION_KEY];
        const totpSecret = typeof rawSecret === "string" ? rawSecret : "";

        const encResult = await encryptVault({ email, password, totpSecret }, extensionPassword);
        if (encResult.isErr()) {
          errorMsg.hidden = false;
          syncValidation();
          return;
        }

        await browser.storage.local.set({ [VAULT_STORAGE_KEY]: encResult.value });
        await browser.storage.session?.set({ [SESSION_MASTER_KEY]: extensionPassword });
        await browser.storage.session?.remove(PENDING_TOTP_SECRET_SESSION_KEY);

        dispatch("EXT_PASSWORD_SAVED");
      } catch (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[CUNYAutoLogin] extPasswordSetup: unexpected vault save error", error);
        }
        errorMsg.hidden = false;
        syncValidation();
      }
    })();
  });

  root.appendChild(container);
  return { unmount: () => container.remove() };
};
