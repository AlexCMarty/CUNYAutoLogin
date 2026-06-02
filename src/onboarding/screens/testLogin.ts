/**
 * TEST_LOGIN — a real Brightspace auto-login that proves the pasted key works
 * (bead 3). Reuses the COMPLETE_DEMO checklist look (row/dot/text classes).
 *
 * VISUALS-ONLY PASS: this renders a single static frame — no live sign-in, no
 * animation, no timers. `qaVariant=success` shows the signed-in frame; the
 * default shows the in-progress frame (filling password). The wiring pass will
 * drive the steps from real auto-fill progress and dispatch
 * TEST_SUCCEEDED / TEST_BAD_CREDENTIALS / TEST_BAD_KEY (advanced-key-flow.md §6–7).
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const STEPS = [
  "Opening Brightspace",
  "Filling in your email",
  "Filling in your password",
  "Generating your six-digit code",
  "Signed in",
] as const;

/** In-progress frame: rows 0–1 done, row 2 ("password") active. */
const IN_PROGRESS_ACTIVE_IDX = 2;

const HEADLINE_PROGRESS = "Let's make sure it works.";
const HEADLINE_SUCCESS = "Your key works.";
const BODY_PROGRESS =
  "We're signing into Brightspace in a new tab using your key. Nothing for " +
  "you to do — just watch.";
const BODY_SUCCESS =
  "We signed into Brightspace with your key. Next we'll seal everything into " +
  "your vault.";
const DEMO_STATUS_PROGRESS = "Watch the new tab — we're doing the work.";
const STATUS_SUCCESS = "Signed in. Saving your vault…";

const buildChecklist = (doc: Document, success: boolean): HTMLElement => {
  const list = doc.createElement("div");
  list.className = "onboarding-demo-list";
  // success → all rows done; otherwise the active row sits at the password step.
  const activeIdx = success ? STEPS.length : IN_PROGRESS_ACTIVE_IDX;
  STEPS.forEach((step, idx) => {
    const done = idx < activeIdx;
    const active = idx === activeIdx;
    const row = doc.createElement("div");
    row.className = "onboarding-demo-row";
    const dot = doc.createElement("span");
    dot.className = "onboarding-demo-dot";
    dot.dataset.active = active ? "true" : "false";
    dot.dataset.done = done ? "true" : "false";
    const text = doc.createElement("span");
    text.className = "onboarding-demo-text";
    text.dataset.active = active ? "true" : "false";
    text.textContent = active && !success ? `${step}…` : step;
    row.appendChild(dot);
    row.appendChild(text);
    list.appendChild(row);
  });
  return list;
};

export const mountTestLoginScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, qaVariant } = ctx;
  const success = qaVariant === "success";

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "TEST_LOGIN";
  container.dataset.onboardingTestPhase = success ? "success" : "progress";
  container.className = "onboarding-screen onboarding-screen-test-login";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = success ? HEADLINE_SUCCESS : HEADLINE_PROGRESS;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = success ? BODY_SUCCESS : BODY_PROGRESS;

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(buildChecklist(doc, success));

  if (success) {
    const status = doc.createElement("p");
    status.className = "onboarding-status";
    const check = doc.createElement("span");
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓"; // ✓
    const statusText = doc.createElement("span");
    statusText.textContent = STATUS_SUCCESS;
    status.appendChild(check);
    status.appendChild(statusText);
    container.appendChild(status);
  } else {
    const demoStatus = doc.createElement("p");
    demoStatus.className = "onboarding-demo-status";
    demoStatus.textContent = DEMO_STATUS_PROGRESS;
    container.appendChild(demoStatus);
  }

  root.appendChild(container);

  return {
    unmount: () => {
      container.remove();
    },
  };
};
