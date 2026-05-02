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

const SCREEN_LABEL = "What email do you use to log in to Brightspace?";
const SCREEN_SUBTEXT =
  "This is usually firstname.lastname@login.cuny.edu. It is not your @baruchmail.cuny.edu or other school email.";
const INLINE_HINT_COPY =
  "CUNY logins end in @login.cuny.edu \u2014 check your CUNYfirst welcome email if you're unsure.";
export const CREDENTIAL_ERROR_INLINE_COPY =
  "That email and password didn't work on CUNY. Double-check and try again.";
const CTA_LABEL = "Continue";
const BACK_LABEL = "Back";

/** Strips repeated `@login.cuny.edu` tails (Playwright fill + seeded suffix can double in Chromium). */
const stripDuplicateLoginSuffix = (value: string): string => {
  let out = value.trim();
  const double = `${LOGIN_EMAIL_SUFFIX}${LOGIN_EMAIL_SUFFIX}`;
  while (out.endsWith(double)) {
    out = out.slice(0, -LOGIN_EMAIL_SUFFIX.length);
  }
  return out;
};

export const EMAIL_INPUT_SELECTOR = "[data-onboarding-email-input='true']";
export const EMAIL_FORWARD_SELECTOR = "[data-onboarding-email-forward='true']";
export const EMAIL_BACK_SELECTOR = "[data-onboarding-email-back='true']";
export const EMAIL_INLINE_HINT_SELECTOR =
  "[data-onboarding-email-hint='true']";
export const EMAIL_CREDENTIAL_ERROR_SELECTOR =
  "[data-onboarding-email-credential-error='true']";

// Screen mount functions are intentionally long: they build DOM, register all
// event listeners, and return a single cleanup handle. Splitting by concern
// would require threading many refs across helper functions.
// eslint-disable-next-line max-lines-per-function
export const mountEmailEntryScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, dispatch, setEmail, setCredentialError, getSnapshot } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "EMAIL_ENTRY";
  container.className = "onboarding-screen onboarding-screen-email";

  // Inline banner when the CUNY tab reported wrong credentials (copy matches password screen).
  const credentialError = doc.createElement("p");
  credentialError.dataset.onboardingEmailCredentialError = "true";
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

  const input = doc.createElement("input");
  input.type = "email";
  input.dataset.onboardingEmailInput = "true";
  input.className = "onboarding-input onboarding-input-pill";
  input.autocomplete = "username";
  input.inputMode = "email";
  input.spellcheck = false;
  input.setAttribute("aria-describedby", "onboarding-email-hint");
  // Seed with the suffix so the student can type a username and skip the "@".
  const seeded = stripDuplicateLoginSuffix(getSnapshot().email);
  input.value = seeded || LOGIN_EMAIL_SUFFIX;

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
  root.appendChild(container);

  const refreshForwardDisabled = (): void => {
    forward.disabled = !validateEmail(input.value);
  };
  refreshForwardDisabled();

  const placeCursorBeforeAt = (): void => {
    // Browsers reject setSelectionRange on type="email". Swap to "text",
    // position the cursor, then restore — deferred so the type change does
    // not interfere with any in-flight focus/fill operation on this element.
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

  const handleFocus = (): void => {
    placeCursorBeforeAt();
  };

  const handleInput = (): void => {
    setEmail(stripDuplicateLoginSuffix(input.value));
    refreshForwardDisabled();
    if (!hint.hidden && validateEmail(input.value)) {
      hint.hidden = true;
    }
    // Per spec: once the student starts correcting the failing field, the red
    // banner goes away — they are no longer looking at stale state.
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

  // Prime the in-memory snapshot so the next screen sees whatever the student
  // types, even if they never fire an input event in unit tests.
  setEmail(stripDuplicateLoginSuffix(input.value));
  input.focus();

  return {
    unmount: () => {
      input.removeEventListener("focus", handleFocus);
      input.removeEventListener("input", handleInput);
      input.removeEventListener("blur", handleBlur);
      input.removeEventListener("keydown", handleKeydown);
      forward.removeEventListener("click", handleForward);
      back.removeEventListener("click", handleBack);
      container.remove();
    },
  };
};
