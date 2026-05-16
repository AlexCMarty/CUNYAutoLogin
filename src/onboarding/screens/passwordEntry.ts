/**
 * Screen 3 — Password entry.
 *
 * Copy rules enforced here:
 *  - Label: "What's your Brightspace password?"
 *  - Subtext: "The password you use to log in to Brightspace."
 *  - Reassurance line (between input and forward) explains short-term scope:
 *    saved on device, encrypted, used now to log in.
 *  - Show/hide toggle on the input.
 *  - Forward disabled until non-empty. No local password rules — CUNY surfaces errors.
 *  - Back returns to EMAIL_ENTRY.
 *
 * Security: password lives only in the controller snapshot; never written to
 * `storage.local` or `storage.session`.
 */

import { SHOW_PASSWORD_LABEL, HIDE_PASSWORD_LABEL } from "../../sidebar/passwordToggleLabels";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_LABEL = "And your CUNY password.";
const SCREEN_SUBTEXT = "The password you use to log in to Brightspace or CUNYFirst.";
const REASSURANCE_COPY =
  "We'll save it on this computer and use it now to sign you in so you can watch it work.";
const CREDENTIAL_ERROR_INLINE_COPY =
  "That email and password didn't work. Double-check and try again.";
const CTA_LABEL = "Continue";
const BACK_LABEL = "Back";

export const PASSWORD_INPUT_SELECTOR =
  "[data-onboarding-password-input='true']";
export const PASSWORD_FORWARD_SELECTOR =
  "[data-onboarding-password-forward='true']";
export const PASSWORD_BACK_SELECTOR =
  "[data-onboarding-password-back='true']";
export const PASSWORD_TOGGLE_SELECTOR =
  "[data-onboarding-password-toggle='true']";
type PasswordEntryDom = {
  readonly container: HTMLElement;
  readonly credentialError: HTMLParagraphElement;
  readonly input: HTMLInputElement;
  readonly toggle: HTMLButtonElement;
  readonly forward: HTMLButtonElement;
  readonly back: HTMLButtonElement;
};

const buildPasswordEntryDom = (
  doc: Document,
  initialPassword: string,
  credentialErrorVisible: boolean
): PasswordEntryDom => {
  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "PASSWORD_ENTRY";
  container.className = "onboarding-screen onboarding-screen-password";

  const credentialError = doc.createElement("p");
  credentialError.dataset.onboardingPasswordCredentialError = "true";
  credentialError.className = "onboarding-credential-error";
  credentialError.setAttribute("role", "alert");
  credentialError.textContent = CREDENTIAL_ERROR_INLINE_COPY;
  credentialError.hidden = !credentialErrorVisible;

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
  input.value = initialPassword;

  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.dataset.onboardingPasswordToggle = "true";
  toggle.className = "onboarding-input-toggle";
  toggle.setAttribute("aria-label", SHOW_PASSWORD_LABEL);
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

  return { container, credentialError, input, toggle, forward, back };
};

const attachPasswordEntryHandlers = (
  dispatch: OnboardingScreenContext["dispatch"],
  setPassword: OnboardingScreenContext["setPassword"],
  setCredentialError: OnboardingScreenContext["setCredentialError"],
  dom: PasswordEntryDom
): (() => void) => {
  const { input, forward, back, toggle, credentialError } = dom;

  const refreshForwardDisabled = (): void => {
    forward.disabled = input.value.length === 0;
  };
  refreshForwardDisabled();

  const handleInput = (): void => {
    setPassword(input.value);
    refreshForwardDisabled();
    if (!credentialError.hidden) {
      credentialError.hidden = true;
      setCredentialError(null);
    }
  };

  const handleToggle = (): void => {
    const wasPasswordVisible = input.type === "text";
    input.type = wasPasswordVisible ? "password" : "text";
    toggle.setAttribute(
      "aria-label",
      wasPasswordVisible ? SHOW_PASSWORD_LABEL : HIDE_PASSWORD_LABEL,
    );
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

  return () => {
    input.removeEventListener("input", handleInput);
    input.removeEventListener("keydown", handleKeydown);
    toggle.removeEventListener("click", handleToggle);
    forward.removeEventListener("click", handleForward);
    back.removeEventListener("click", handleBack);
  };
};

export const mountPasswordEntryScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch, setPassword, setCredentialError, getSnapshot } = ctx;
  const snap = getSnapshot();
  const dom = buildPasswordEntryDom(
    doc,
    snap.password,
    snap.credentialError !== null
  );
  root.appendChild(dom.container);
  dom.input.focus();
  const detach = attachPasswordEntryHandlers(dispatch, setPassword, setCredentialError, dom);
  return {
    unmount: () => {
      detach();
      dom.container.remove();
    },
  };
};
