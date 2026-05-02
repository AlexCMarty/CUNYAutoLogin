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

type ExtPasswordRefs = {
  readonly container: HTMLElement;
  readonly pwInput: HTMLInputElement;
  readonly pwToggle: HTMLButtonElement;
  readonly confirmInput: HTMLInputElement;
  readonly confirmToggle: HTMLButtonElement;
  readonly strengthSpan: HTMLSpanElement;
  readonly matchIndicator: HTMLSpanElement;
  readonly forwardBtn: HTMLButtonElement;
  readonly errorMsg: HTMLParagraphElement;
};

const createExtPasswordContainer = (doc: Document): HTMLElement => {
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
  return container;
};

const appendExtPasswordFields = (
  doc: Document,
  container: HTMLElement
): Omit<ExtPasswordRefs, "container"> => {
  const pwLabel = doc.createElement("label");
  pwLabel.className = "onboarding-field-label";
  pwLabel.textContent = "Choose a password";
  container.appendChild(pwLabel);

  const pwWrap = doc.createElement("div");
  pwWrap.className = "onboarding-input-wrap";

  const pwInput = doc.createElement("input");
  pwInput.type = "password";
  pwInput.className = "onboarding-input";
  pwInput.dataset.onboardingExtPasswordInput = "true";
  pwInput.autocomplete = "new-password";

  const pwToggle = doc.createElement("button");
  pwToggle.type = "button";
  pwToggle.className = "onboarding-input-toggle";
  pwToggle.dataset.onboardingExtPasswordToggle = "true";
  pwToggle.setAttribute("aria-label", "Show password");
  pwToggle.textContent = "\u{1F441}";

  pwWrap.appendChild(pwInput);
  pwWrap.appendChild(pwToggle);
  container.appendChild(pwWrap);

  const strengthSpan = doc.createElement("span");
  strengthSpan.className = "onboarding-ext-password-strength";
  strengthSpan.dataset.onboardingExtPasswordStrength = "true";
  container.appendChild(strengthSpan);

  const confirmLabel = doc.createElement("label");
  confirmLabel.className = "onboarding-field-label";
  confirmLabel.textContent = "Confirm password";
  container.appendChild(confirmLabel);

  const confirmWrap = doc.createElement("div");
  confirmWrap.className = "onboarding-input-wrap";

  const confirmInput = doc.createElement("input");
  confirmInput.type = "password";
  confirmInput.className = "onboarding-input";
  confirmInput.dataset.onboardingExtPasswordConfirm = "true";
  confirmInput.autocomplete = "new-password";

  const confirmToggle = doc.createElement("button");
  confirmToggle.type = "button";
  confirmToggle.className = "onboarding-input-toggle";
  confirmToggle.dataset.onboardingExtPasswordConfirmToggle = "true";
  confirmToggle.setAttribute("aria-label", "Show password");
  confirmToggle.textContent = "\u{1F441}";

  confirmWrap.appendChild(confirmInput);
  confirmWrap.appendChild(confirmToggle);
  container.appendChild(confirmWrap);

  const matchIndicator = doc.createElement("span");
  matchIndicator.className = "onboarding-ext-password-match";
  matchIndicator.dataset.onboardingExtPasswordMatchIndicator = "true";
  matchIndicator.hidden = true;
  container.appendChild(matchIndicator);

  const errorMsg = doc.createElement("p");
  errorMsg.className = "onboarding-error onboarding-ext-password-error";
  errorMsg.hidden = true;
  errorMsg.textContent = "Something went wrong saving your password. Please try again.";
  container.appendChild(errorMsg);

  const forwardBtn = doc.createElement("button");
  forwardBtn.type = "button";
  forwardBtn.className = "onboarding-btn onboarding-btn-primary";
  forwardBtn.dataset.onboardingExtPasswordForward = "true";
  forwardBtn.textContent = "Set my extension password";
  forwardBtn.disabled = true;
  container.appendChild(forwardBtn);

  return {
    pwInput,
    pwToggle,
    confirmInput,
    confirmToggle,
    strengthSpan,
    matchIndicator,
    forwardBtn,
    errorMsg,
  };
};

const buildExtPasswordSetupRefs = (doc: Document): ExtPasswordRefs => {
  const container = createExtPasswordContainer(doc);
  const fields = appendExtPasswordFields(doc, container);
  return { container, ...fields };
};

const runExtPasswordVaultSave = async (
  getSnapshot: OnboardingScreenContext["getSnapshot"],
  dispatch: OnboardingScreenContext["dispatch"],
  refs: ExtPasswordRefs,
  syncValidation: () => void
): Promise<void> => {
  const { pwInput, forwardBtn, errorMsg } = refs;
  const extensionPassword = pwInput.value;
  forwardBtn.disabled = true;
  errorMsg.hidden = true;

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
};

const attachExtPasswordSetupHandlers = (
  ctx: Pick<OnboardingScreenContext, "dispatch" | "getSnapshot">,
  refs: ExtPasswordRefs
): (() => void) => {
  const { dispatch, getSnapshot } = ctx;
  const {
    pwInput,
    pwToggle,
    confirmInput,
    confirmToggle,
    strengthSpan,
    matchIndicator,
    forwardBtn,
  } = refs;

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

  const handlePwToggle = (): void => {
    const showing = pwInput.type === "text";
    pwInput.type = showing ? "password" : "text";
    pwToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  };

  const handleConfirmToggle = (): void => {
    const showing = confirmInput.type === "text";
    confirmInput.type = showing ? "password" : "text";
    confirmToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  };

  const handlePwKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") confirmInput.focus();
  };

  const handleConfirmKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") forwardBtn.click();
  };

  const handleForwardClick = (): void => {
    void runExtPasswordVaultSave(getSnapshot, dispatch, refs, syncValidation);
  };

  pwInput.addEventListener("input", syncValidation);
  pwInput.addEventListener("keydown", handlePwKeydown);
  confirmInput.addEventListener("input", syncValidation);
  confirmInput.addEventListener("keydown", handleConfirmKeydown);
  pwToggle.addEventListener("click", handlePwToggle);
  confirmToggle.addEventListener("click", handleConfirmToggle);
  forwardBtn.addEventListener("click", handleForwardClick);

  return () => {
    pwInput.removeEventListener("input", syncValidation);
    pwInput.removeEventListener("keydown", handlePwKeydown);
    confirmInput.removeEventListener("input", syncValidation);
    confirmInput.removeEventListener("keydown", handleConfirmKeydown);
    pwToggle.removeEventListener("click", handlePwToggle);
    confirmToggle.removeEventListener("click", handleConfirmToggle);
    forwardBtn.removeEventListener("click", handleForwardClick);
  };
};

export const mountExtPasswordSetupScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch, getSnapshot } = ctx;
  const refs = buildExtPasswordSetupRefs(doc);
  const detach = attachExtPasswordSetupHandlers({ dispatch, getSnapshot }, refs);
  root.appendChild(refs.container);
  refs.pwInput.focus();
  return {
    unmount: () => {
      detach();
      refs.container.remove();
    },
  };
};
