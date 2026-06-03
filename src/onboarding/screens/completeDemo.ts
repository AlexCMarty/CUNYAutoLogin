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
  "Generating your login code",
  "Signed in",
] as const;

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

  const finish = (): void => {
    statusEl.hidden = false;
    statusEl.textContent = "Watch the CUNY tab — we're doing the work.";
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
    skipBtn.hidden = true;
    const msg: OnboardingReopenCunyTab = {
      type: "ONBOARDING_REOPEN_CUNY_TAB",
      url: BRIGHTSPACE_HOME_URL,
    };
    void browser.runtime.sendMessage(msg).catch(() => undefined);
    dispatch("DEMO_REQUESTED");
    // A preview, not a proof: let the fallback finish the final bead, while
    // real progress events (if the reopened tab logs in) advance it sooner.
    checklist.begin({ completeFinal: true, onComplete: finish });
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
