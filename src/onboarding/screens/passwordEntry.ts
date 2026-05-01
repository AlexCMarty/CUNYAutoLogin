/**
 * Screen 3 — Password entry.
 *
 * Spec reference: `overhaul-onboarding.md §Screen 3`.
 * Copy rules enforced here:
 *  - Label: "What's your Brightspace password?"
 *  - Subtext: "The password you use to log in to Brightspace."
 *  - Reassurance line (between input and forward button) explains the
 *    short-term scope: saved on device, encrypted, used right now to log in.
 *  - Show/hide eye toggle on the input pill.
 *  - Forward button grayed until the input is non-empty. No content
 *    validation — wrong-password detection lives on CUNY's page.
 *  - Back button returns to EMAIL_ENTRY.
 *
 * Security: the password value lives only in the controller's in-memory
 * snapshot. This screen never writes to `storage.local` or `storage.session`.
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_LABEL = "What's your Brightspace password?";
const SCREEN_SUBTEXT = "The password you use to log in to Brightspace.";
const REASSURANCE_COPY =
  "We'll save these on your device, encrypted, and use them right now to log you in so you can watch it work.";
export const CREDENTIAL_ERROR_INLINE_COPY =
  "That email and password didn't work on CUNY. Double-check and try again.";
const CTA_LABEL = "Continue";
const BACK_LABEL = "Back";
const SHOW_LABEL = "Show password";
const HIDE_LABEL = "Hide password";

export const PASSWORD_INPUT_SELECTOR =
  "[data-onboarding-password-input='true']";
export const PASSWORD_FORWARD_SELECTOR =
  "[data-onboarding-password-forward='true']";
export const PASSWORD_BACK_SELECTOR =
  "[data-onboarding-password-back='true']";
export const PASSWORD_TOGGLE_SELECTOR =
  "[data-onboarding-password-toggle='true']";
export const PASSWORD_CREDENTIAL_ERROR_SELECTOR =
  "[data-onboarding-password-credential-error='true']";

// eslint-disable-next-line max-lines-per-function
export const mountPasswordEntryScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, dispatch, setPassword, setCredentialError, getSnapshot } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "PASSWORD_ENTRY";
  container.className = "onboarding-screen onboarding-screen-password";

  // Inline credential-error banner surfaced above the input when the content
  // script reported wrong-credentials on the CUNY tab. Spec copy
  // (`overhaul-onboarding.md §Screen 4-error`).
  const credentialError = doc.createElement("p");
  credentialError.dataset.onboardingPasswordCredentialError = "true";
  credentialError.className = "onboarding-credential-error";
  credentialError.setAttribute("role", "alert");
  credentialError.textContent = CREDENTIAL_ERROR_INLINE_COPY;
  credentialError.hidden = getSnapshot().credentialError === null;

  const label = doc.createElement("label");
  label.className = "onboarding-label";
  const labelText = doc.createElement("span");
  labelText.className = "onboarding-label-text";
  labelText.textContent = SCREEN_LABEL;
  const subtext = doc.createElement("span");
  subtext.className = "onboarding-subtext";
  subtext.textContent = SCREEN_SUBTEXT;

  const inputWrap = doc.createElement("div");
  inputWrap.className = "onboarding-input-wrap";

  const input = doc.createElement("input");
  input.type = "password";
  input.dataset.onboardingPasswordInput = "true";
  input.className = "onboarding-input onboarding-input-pill";
  input.autocomplete = "current-password";
  input.value = getSnapshot().password;

  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.dataset.onboardingPasswordToggle = "true";
  toggle.className = "onboarding-input-toggle";
  toggle.setAttribute("aria-label", SHOW_LABEL);
  toggle.textContent = "\u{1F441}";

  inputWrap.appendChild(input);
  inputWrap.appendChild(toggle);
  label.appendChild(labelText);
  label.appendChild(subtext);
  label.appendChild(inputWrap);

  const reassurance = doc.createElement("p");
  reassurance.className = "onboarding-reassurance";
  reassurance.textContent = REASSURANCE_COPY;

  const back = doc.createElement("button");
  back.type = "button";
  back.dataset.onboardingPasswordBack = "true";
  back.className = "onboarding-back secondary";
  back.textContent = BACK_LABEL;

  const forward = doc.createElement("button");
  forward.type = "button";
  forward.dataset.onboardingPasswordForward = "true";
  forward.className = "onboarding-cta primary";
  forward.textContent = CTA_LABEL;

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions";
  actions.appendChild(back);
  actions.appendChild(forward);

  container.appendChild(credentialError);
  container.appendChild(label);
  container.appendChild(reassurance);
  container.appendChild(actions);
  root.appendChild(container);

  const refreshForwardDisabled = (): void => {
    forward.disabled = input.value.length === 0;
  };
  refreshForwardDisabled();

  const handleInput = (): void => {
    setPassword(input.value);
    refreshForwardDisabled();
    // Per spec: once the student starts correcting, drop the stale red banner.
    if (!credentialError.hidden) {
      credentialError.hidden = true;
      setCredentialError(null);
    }
  };

  const handleToggle = (): void => {
    const isPasswordVisible = input.type === "text";
    input.type = isPasswordVisible ? "password" : "text";
    toggle.setAttribute("aria-label", isPasswordVisible ? SHOW_LABEL : HIDE_LABEL);
  };

  const handleForward = (): void => {
    if (input.value.length === 0) return;
    setPassword(input.value);
    dispatch("NEXT");
  };

  const handleBack = (): void => {
    dispatch("BACK");
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") handleForward();
  };

  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleKeydown);
  toggle.addEventListener("click", handleToggle);
  forward.addEventListener("click", handleForward);
  back.addEventListener("click", handleBack);

  return {
    unmount: () => {
      input.removeEventListener("input", handleInput);
      input.removeEventListener("keydown", handleKeydown);
      toggle.removeEventListener("click", handleToggle);
      forward.removeEventListener("click", handleForward);
      back.removeEventListener("click", handleBack);
      container.remove();
    },
  };
};
