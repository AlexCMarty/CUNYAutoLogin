/**
 * TEST_LOGIN_BAD_CREDENTIALS — the test login failed on email/password (bead 3).
 *
 * CUNY can't reliably tell email from password apart, so the copy asks the
 * student to check both (advanced-key-flow.md §7). "Signing in as <email>"
 * echoes the staged email so they can spot a wrong address.
 *
 * VISUALS-ONLY PASS: buttons are inert. The wiring pass dispatches
 * RETRY_CREDENTIALS (→ PASSWORD_ENTRY) and EDIT_EMAIL (→ EMAIL_ENTRY).
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const HEADLINE = "That email or password didn't work.";
const BODY =
  "We couldn't sign in. One of them is off — and we can't tell which, so it's " +
  "worth checking both.";
const RETRY_LABEL = "Try again";
const EDIT_EMAIL_LABEL = "My email is wrong";
/** Shown when no email has been staged (e.g. a bare dev jump). */
const SAMPLE_EMAIL = "jane.doe12@login.cuny.edu";

export const mountTestLoginBadCredentialsScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, getSnapshot } = ctx;
  const email = getSnapshot().email.trim() || SAMPLE_EMAIL;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "TEST_LOGIN_BAD_CREDENTIALS";
  container.className =
    "onboarding-screen onboarding-screen-test-bad-credentials";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = HEADLINE;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = BODY;

  const signingInAs = doc.createElement("p");
  signingInAs.className = "onboarding-inline-hint";
  signingInAs.appendChild(doc.createTextNode("Signing in as "));
  const emailStrong = doc.createElement("strong");
  emailStrong.style.color = "var(--clr-text)";
  emailStrong.textContent = email;
  signingInAs.appendChild(emailStrong);

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions";
  actions.style.flexDirection = "column";
  actions.style.gap = "8px";

  const retry = doc.createElement("button");
  retry.type = "button";
  retry.dataset.onboardingBadCredRetry = "true";
  retry.className = "onboarding-btn onboarding-btn-primary";
  retry.textContent = RETRY_LABEL;

  const editEmail = doc.createElement("button");
  editEmail.type = "button";
  editEmail.dataset.onboardingBadCredEditEmail = "true";
  editEmail.className = "onboarding-btn-link";
  editEmail.textContent = EDIT_EMAIL_LABEL;

  actions.appendChild(retry);
  actions.appendChild(editEmail);

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(signingInAs);
  container.appendChild(actions);
  root.appendChild(container);

  return {
    unmount: () => {
      container.remove();
    },
  };
};
