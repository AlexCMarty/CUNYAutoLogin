/**
 * Shared builder for the two structurally-identical "paste an existing key"
 * screens — KEY_FROM_OTHER_DEVICE and KEY_FROM_AUTH_APP. They share input,
 * validation, and layout; only the headline/body and the instruction-accordion
 * copy differ (advanced-key-flow.md §2). Parameterised by `PasteKeyCopy`.
 *
 * Local field interactivity (this pass):
 *   • The instruction accordion is a native <details> — opens/closes for free.
 *   • The Secret-key input validates live against the SAME Base32 normaliser the
 *     content script uses (`normalizeTotpSecretCandidate`, ssoSite.ts) — no
 *     second validator. Valid → the green "✓ valid key" line shows and Confirm
 *     enables; empty/invalid → the grey hint shows and Confirm stays disabled.
 *
 * NOT wired this pass: Back and Confirm do not navigate (no dispatch). The
 * wiring pass dispatches KEY_CONFIRMED / BACK and stages the secret.
 *
 * Dev/QA `qaVariant`: `open` renders with the accordion expanded; `valid`
 * prefills a sample key so capture-sidebar can grab the valid/enabled look.
 */

import { normalizeTotpSecretCandidate } from "../../cuny/ssoSite";
import type { OnboardingScreenContext, ScreenHandle } from "./screenContext";

/** A single instruction line, optionally with bolded fragments. */
type StepPart = string | { readonly strong: string };

export type PasteKeyCopy = {
  readonly state: "KEY_FROM_OTHER_DEVICE" | "KEY_FROM_AUTH_APP";
  readonly screenModifier: string;
  readonly headline: string;
  readonly body: string;
  readonly accordionSummary: string;
  readonly steps: readonly (readonly StepPart[])[];
};

const FIELD_LABEL = "Secret key";
const PLACEHOLDER = "J3OGKQ2V24VE6XVQOQ4NQTB7MT";
const OK_COPY = "That looks like a valid key.";
const HINT_COPY =
  "A 2FA key is letters A–Z and numbers 2–7. We'll check it before continuing.";
const BACK_LABEL = "Back";
const CONFIRM_LABEL = "Confirm";
/** Sample valid key used only for the `qaVariant=valid` capture look. */
const QA_VALID_SAMPLE_KEY = "MZXW6YTBOI7EU4DPNZSGK3TL";

const appendSteps = (
  doc: Document,
  list: HTMLElement,
  steps: readonly (readonly StepPart[])[]
): void => {
  steps.forEach((parts) => {
    const li = doc.createElement("li");
    parts.forEach((part) => {
      if (typeof part === "string") {
        li.appendChild(doc.createTextNode(part));
      } else {
        const strong = doc.createElement("strong");
        strong.textContent = part.strong;
        li.appendChild(strong);
      }
    });
    list.appendChild(li);
  });
};

const buildAccordion = (
  doc: Document,
  copy: PasteKeyCopy,
  open: boolean
): HTMLDetailsElement => {
  const details = doc.createElement("details");
  details.className = "onboarding-accordion";
  details.open = open;

  const summary = doc.createElement("summary");
  const summaryText = doc.createElement("span");
  summaryText.textContent = copy.accordionSummary;
  const chevron = doc.createElement("span");
  chevron.className = "onboarding-accordion-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▾"; // ▾
  summary.appendChild(summaryText);
  summary.appendChild(chevron);

  const bodyWrap = doc.createElement("div");
  bodyWrap.className = "onboarding-accordion-body";
  const ol = doc.createElement("ol");
  appendSteps(doc, ol, copy.steps);
  bodyWrap.appendChild(ol);

  details.appendChild(summary);
  details.appendChild(bodyWrap);
  return details;
};

export const mountPasteKeyScreen = (
  ctx: OnboardingScreenContext,
  copy: PasteKeyCopy
): ScreenHandle => {
  const { doc, root, qaVariant } = ctx;
  const accordionOpen = qaVariant === "open";

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = copy.state;
  container.className = `onboarding-screen ${copy.screenModifier}`;

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = copy.headline;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = copy.body;

  const accordion = buildAccordion(doc, copy, accordionOpen);

  const fieldWrap = doc.createElement("div");
  const label = doc.createElement("label");
  label.className = "onboarding-field-label";
  label.textContent = FIELD_LABEL;

  const input = doc.createElement("input");
  input.type = "text";
  input.dataset.onboardingKeyInput = "true";
  input.className = "onboarding-input onboarding-input--key";
  input.spellcheck = false;
  input.autocapitalize = "characters";
  input.placeholder = PLACEHOLDER;

  const ok = doc.createElement("p");
  ok.dataset.onboardingKeyOk = "true";
  ok.className = "onboarding-field-ok";
  ok.style.marginTop = "6px";
  ok.textContent = OK_COPY;

  const hint = doc.createElement("p");
  hint.dataset.onboardingKeyHint = "true";
  hint.className = "onboarding-inline-hint";
  hint.style.marginTop = "6px";
  hint.textContent = HINT_COPY;

  fieldWrap.appendChild(label);
  fieldWrap.appendChild(input);
  fieldWrap.appendChild(ok);
  fieldWrap.appendChild(hint);

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions";
  const back = doc.createElement("button");
  back.type = "button";
  back.dataset.onboardingKeyBack = "true";
  back.className = "onboarding-back secondary";
  back.textContent = BACK_LABEL;
  const confirm = doc.createElement("button");
  confirm.type = "button";
  confirm.dataset.onboardingKeyConfirm = "true";
  confirm.className = "onboarding-cta primary";
  confirm.textContent = CONFIRM_LABEL;
  actions.appendChild(back);
  actions.appendChild(confirm);

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(accordion);
  container.appendChild(fieldWrap);
  container.appendChild(actions);

  // Live validity → toggles the ✓/hint lines and the Confirm button.
  const refreshValidity = (): void => {
    const valid = normalizeTotpSecretCandidate(input.value) !== null;
    ok.hidden = !valid;
    hint.hidden = valid;
    confirm.disabled = !valid;
  };
  const handleInput = (): void => refreshValidity();
  input.addEventListener("input", handleInput);

  if (qaVariant === "valid") {
    input.value = QA_VALID_SAMPLE_KEY;
  }
  refreshValidity();

  root.appendChild(container);

  return {
    unmount: () => {
      input.removeEventListener("input", handleInput);
      container.remove();
    },
  };
};
