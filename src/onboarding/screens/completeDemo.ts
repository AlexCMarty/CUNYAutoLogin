import browser from "webextension-polyfill";
import type { OnboardingReopenCunyTab } from "../messages";
import { BRIGHTSPACE_HOME_URL } from "../../cuny/ssoSite";
import { buildLoginChecklist } from "./loginChecklist";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

/**
 * COMPLETE_DEMO — the guided "You're all set." preview. Reuses the shared
 * login checklist (see loginChecklist.ts) so it stays in lockstep with
 * TEST_LOGIN. Only the first step's wording differs per screen.
 */
const DEMO_STEPS = [
  "Opening CUNY Login",
  "Filling in your email / password",
  "Filling in your login code",
  "Signed in",
] as const;

const WATCH_TAB_HINT = "Watch the CUNY tab — we're doing the work.";
const SIGNED_IN_STATUS = "Signed in.";

export const mountCompleteDemoScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "COMPLETE_DEMO";
  container.className = "onboarding-screen onboarding-screen-complete-demo";

  const h2 = doc.createElement("h2");
  h2.className = "onboarding-headline";
  h2.textContent = "You're all set.";
  container.appendChild(h2);

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent =
    "Next time you need to sign in to CUNY, this is what happens — no password needed.";
  container.appendChild(body);

  const checklist = buildLoginChecklist(doc, DEMO_STEPS);
  container.appendChild(checklist.element);

  const statusEl = doc.createElement("p");
  statusEl.className = "onboarding-demo-status";
  statusEl.dataset.onboardingDemoStatus = "true";
  statusEl.hidden = true;
  container.appendChild(statusEl);

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions";
  actions.style.flexDirection = "column";
  actions.style.gap = "8px";

  const showBtn = doc.createElement("button");
  showBtn.type = "button";
  showBtn.className = "onboarding-btn onboarding-btn-primary";
  showBtn.dataset.onboardingDemoShow = "true";
  showBtn.textContent = "Show me";

  const skipBtn = doc.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "onboarding-btn-link";
  skipBtn.dataset.onboardingDemoSkip = "true";
  skipBtn.textContent = "Skip";
  skipBtn.addEventListener("click", () => dispatch("DEMO_FINISHED"));

  actions.appendChild(showBtn);
  actions.appendChild(skipBtn);
  container.appendChild(actions);

  // Fired by the real `signed_in` (cookie) signal once every bead is done.
  const finish = (): void => {
    statusEl.hidden = false;
    statusEl.textContent = SIGNED_IN_STATUS;
    const doneBtn = doc.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "onboarding-btn onboarding-btn-primary";
    doneBtn.textContent = "Done";
    doneBtn.addEventListener("click", () => dispatch("DEMO_FINISHED"));
    actions.replaceChildren(doneBtn);
  };

  let started = false;
  showBtn.addEventListener("click", () => {
    if (started) return;
    started = true;
    showBtn.disabled = true;
    // Keep "Skip" available: the beads now advance only on real events, so if
    // the reopened login stalls or the tab is closed the student must still be
    // able to finish. Reveal the narration hint so they watch the real tab.
    statusEl.hidden = false;
    statusEl.textContent = WATCH_TAB_HINT;
    const msg: OnboardingReopenCunyTab = {
      type: "ONBOARDING_REOPEN_CUNY_TAB",
      url: BRIGHTSPACE_HOME_URL,
    };
    void browser.runtime.sendMessage(msg).catch(() => undefined);
    dispatch("DEMO_REQUESTED");
    // Real progress only: the reopened tab's login drives the beads; the final
    // "Signed in" bead completes (and reveals Done) on the real cookie signal.
    checklist.begin({ onComplete: finish });
  });

  root.appendChild(container);
  return {
    unmount: () => {
      checklist.unmount();
      container.remove();
    },
    // Only react to real events once the demo is running — a stray message
    // must not light beads before the student presses "Show me".
    onMessage: (message) => {
      if (started) checklist.applyMessage(message);
    },
  };
};
