/**
 * Screen 2 — Email entry.
 *
 * Copy rules enforced here:
 *  - Label asks "What email do you use to log in to Brightspace?" — not
 *    "CUNYfirst email" (see design note: CUNYfirst vs Brightspace ambiguity).
 *  - Subtext reminds the student their login ends in `@login.cuny.edu` and is
 *    NOT their school email.
 *  - Input is prefilled with `@login.cuny.edu` and on focus the cursor is placed
 *    before the `@` so the student types their username only.
 *  - Forward stays disabled until the trimmed value ends with `@login.cuny.edu`
 *    (`validateEmail` in `sidebar.utils`).
 *  - On blur with an invalid address, an inline hint appears.
 *
 * Back returns to WELCOME. Forward dispatches `NEXT` → PASSWORD_ENTRY.
 */

import { LOGIN_EMAIL_SUFFIX } from "../../cuny/ssoSite";
import { validateEmail } from "../../sidebar/sidebar.utils";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_LABEL = "What email do you sign in to CUNY with?";
const SCREEN_SUBTEXT =
  "It's firstname.lastname12@login.cuny.edu — not your @stu-mail.baruch.cuny.edu or other school email.";
const INLINE_HINT_COPY =
  "CUNY logins end in @login.cuny.edu \u2014 check your CUNYfirst welcome email if you're unsure.";
const CREDENTIAL_ERROR_INLINE_COPY =
  "That email and password didn't work. Double-check and try again.";
const CTA_LABEL = "Continue";
const BACK_LABEL = "Back";

/**
 * Strips spurious `@login.cuny.edu` tails that Playwright fill() can inject
 * in Chromium when the input is seeded with `@login.cuny.edu` and the cursor
 * lands at position 0 before fill types the new value there.
 *
 * Two cases handled:
 *  1. Double suffix: `foo@login.cuny.edu@login.cuny.edu` → `foo@login.cuny.edu`
 *  2. Appended suffix after a foreign domain: `foo@bar.edu@login.cuny.edu` → `foo@bar.edu`
 */
const stripDuplicateLoginSuffix = (value: string): string => {
  let out = value.trim();
  const double = `${LOGIN_EMAIL_SUFFIX}${LOGIN_EMAIL_SUFFIX}`;
  while (out.endsWith(double)) {
    out = out.slice(0, -LOGIN_EMAIL_SUFFIX.length);
  }
  if (out.endsWith(LOGIN_EMAIL_SUFFIX)) {
    const beforeSuffix = out.slice(0, -LOGIN_EMAIL_SUFFIX.length);
    if (beforeSuffix.includes("@")) {
      out = beforeSuffix;
    }
  }
  return out;
};

export const EMAIL_INPUT_SELECTOR = "[data-onboarding-email-input='true']";
export const EMAIL_FORWARD_SELECTOR = "[data-onboarding-email-forward='true']";
export const EMAIL_BACK_SELECTOR = "[data-onboarding-email-back='true']";
export const EMAIL_INLINE_HINT_SELECTOR =
  "[data-onboarding-email-hint='true']";
type EmailEntryDom = {
  readonly container: HTMLElement;
  readonly credentialError: HTMLParagraphElement;
  readonly input: HTMLInputElement;
  readonly hint: HTMLParagraphElement;
  readonly forward: HTMLButtonElement;
  readonly back: HTMLButtonElement;
};

const buildEmailEntryDom = (
  doc: Document,
  seededEmail: string,
  credentialErrorVisible: boolean
): EmailEntryDom => {
  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "EMAIL_ENTRY";
  container.className = "onboarding-screen onboarding-screen-email";

  const credentialError = doc.createElement("p");
  credentialError.dataset.onboardingEmailCredentialError = "true";
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

  const input = doc.createElement("input");
  input.type = "email";
  input.dataset.onboardingEmailInput = "true";
  input.className = "onboarding-input";
  input.autocomplete = "username";
  input.inputMode = "email";
  input.spellcheck = false;
  input.setAttribute("aria-describedby", "onboarding-email-hint");
  input.value = seededEmail || LOGIN_EMAIL_SUFFIX;

  label.appendChild(labelText);
  label.appendChild(subtext);
  label.appendChild(input);

  const hint = doc.createElement("p");
  hint.id = "onboarding-email-hint";
  hint.dataset.onboardingEmailHint = "true";
  hint.className = "onboarding-inline-hint";
  hint.setAttribute("role", "alert");
  hint.hidden = true;
  hint.textContent = INLINE_HINT_COPY;

  const back = doc.createElement("button");
  back.type = "button";
  back.dataset.onboardingEmailBack = "true";
  back.className = "onboarding-back secondary";
  back.textContent = BACK_LABEL;

  const forward = doc.createElement("button");
  forward.type = "button";
  forward.dataset.onboardingEmailForward = "true";
  forward.className = "onboarding-cta primary";
  forward.textContent = CTA_LABEL;

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions";
  actions.appendChild(back);
  actions.appendChild(forward);

  container.appendChild(credentialError);
  container.appendChild(label);
  container.appendChild(hint);
  container.appendChild(actions);

  return { container, credentialError, input, hint, forward, back };
};

const placeCursorBeforeAtOnEmailInput = (input: HTMLInputElement): void => {
  requestAnimationFrame(() => {
    const position = input.value.indexOf("@");
    if (position < 0) return;
    input.type = "text";
    try {
      input.setSelectionRange(position, position);
    } catch {
      // jsdom stubs may still throw; cursor placement is cosmetic only.
    }
    input.type = "email";
  });
};

const attachEmailEntryHandlers = (
  ctx: Pick<
    OnboardingScreenContext,
    "dispatch" | "setEmail" | "setCredentialError"
  >,
  dom: EmailEntryDom
): (() => void) => {
  const { dispatch, setEmail, setCredentialError } = ctx;
  const { input, forward, back, hint, credentialError } = dom;

  const refreshForwardDisabled = (): void => {
    forward.disabled = !validateEmail(input.value);
  };
  refreshForwardDisabled();

  const handleFocus = (): void => {
    placeCursorBeforeAtOnEmailInput(input);
  };

  const handleInput = (): void => {
    const normalized = stripDuplicateLoginSuffix(input.value);
    if (normalized !== input.value) {
      input.value = normalized;
    }
    setEmail(normalized);
    refreshForwardDisabled();
    if (!hint.hidden && validateEmail(normalized)) {
      hint.hidden = true;
    }
    if (!credentialError.hidden) {
      credentialError.hidden = true;
      setCredentialError(null);
    }
  };

  const handleBlur = (): void => {
    if (input.value.trim().length === 0) {
      hint.hidden = true;
      return;
    }
    const normalized = stripDuplicateLoginSuffix(input.value);
    if (normalized !== input.value) {
      input.value = normalized;
      setEmail(normalized);
    }
    hint.hidden = validateEmail(input.value);
  };

  const handleForward = (): void => {
    const normalized = stripDuplicateLoginSuffix(input.value);
    if (normalized !== input.value) {
      input.value = normalized;
    }
    if (!validateEmail(normalized)) return;
    setEmail(normalized);
    dispatch("NEXT");
  };

  const handleBack = (): void => {
    dispatch("BACK");
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") handleForward();
  };

  input.addEventListener("focus", handleFocus);
  input.addEventListener("input", handleInput);
  input.addEventListener("blur", handleBlur);
  input.addEventListener("keydown", handleKeydown);
  forward.addEventListener("click", handleForward);
  back.addEventListener("click", handleBack);

  return () => {
    input.removeEventListener("focus", handleFocus);
    input.removeEventListener("input", handleInput);
    input.removeEventListener("blur", handleBlur);
    input.removeEventListener("keydown", handleKeydown);
    forward.removeEventListener("click", handleForward);
    back.removeEventListener("click", handleBack);
  };
};

export const mountEmailEntryScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch, setEmail, setCredentialError, getSnapshot } = ctx;
  const snap = getSnapshot();
  const seeded = stripDuplicateLoginSuffix(snap.email);
  const dom = buildEmailEntryDom(
    doc,
    seeded,
    snap.credentialError !== null
  );
  root.appendChild(dom.container);
  const detach = attachEmailEntryHandlers({ dispatch, setEmail, setCredentialError }, dom);
  setEmail(stripDuplicateLoginSuffix(dom.input.value));
  dom.input.focus();
  return {
    unmount: () => {
      detach();
      dom.container.remove();
    },
  };
};
