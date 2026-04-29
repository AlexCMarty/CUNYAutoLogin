import browser from "webextension-polyfill";
import type { OnboardingReopenCunyTab } from "../messages";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const NARRATION_STEPS = [
  "Opening CUNY Login...",
  "Filling in your email...",
  "Filling in your password...",
  "Generating your login code...",
  "Logged in.",
];
const STEP_INTERVAL_MS = 1_500;

export const mountCompleteDemoScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch } = ctx;

  const timers: ReturnType<typeof setTimeout>[] = [];

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "COMPLETE_DEMO";
  container.className = "onboarding-screen onboarding-screen-complete-demo";

  const h2 = doc.createElement("h2");
  h2.className = "onboarding-headline";
  h2.textContent = "You're all set!";
  container.appendChild(h2);

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent =
    "Next time you open Brightspace, this is what happens -- no password needed.";
  container.appendChild(body);

  const showBtn = doc.createElement("button");
  showBtn.type = "button";
  showBtn.className = "onboarding-btn onboarding-btn-primary";
  showBtn.dataset.onboardingDemoShow = "true";
  showBtn.textContent = "Show me";
  container.appendChild(showBtn);

  const skipBtn = doc.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "onboarding-btn onboarding-btn-link";
  skipBtn.dataset.onboardingDemoSkip = "true";
  skipBtn.textContent = "Skip";
  skipBtn.addEventListener("click", () => dispatch("DEMO_FINISHED"));
  container.appendChild(skipBtn);

  const statusEl = doc.createElement("p");
  statusEl.className = "onboarding-demo-status";
  statusEl.dataset.onboardingDemoStatus = "true";
  statusEl.hidden = true;
  container.appendChild(statusEl);

  showBtn.addEventListener("click", () => {
    showBtn.disabled = true;
    skipBtn.hidden = true;
    statusEl.hidden = false;

    const msg: OnboardingReopenCunyTab = { type: "ONBOARDING_REOPEN_CUNY_TAB" };
    void browser.runtime.sendMessage(msg).catch(() => undefined);

    dispatch("DEMO_REQUESTED");

    NARRATION_STEPS.forEach((step, i) => {
      timers.push(
        setTimeout(() => {
          statusEl.textContent = step;
        }, i * STEP_INTERVAL_MS)
      );
    });

    timers.push(
      setTimeout(() => {
        statusEl.textContent = "That's it. Enjoy never logging in manually again.";

        const doneBtn = doc.createElement("button");
        doneBtn.type = "button";
        doneBtn.className = "onboarding-btn onboarding-btn-primary";
        doneBtn.textContent = "Done";
        doneBtn.addEventListener("click", () => dispatch("DEMO_FINISHED"));
        container.appendChild(doneBtn);
      }, NARRATION_STEPS.length * STEP_INTERVAL_MS)
    );
  });

  root.appendChild(container);
  return {
    unmount: () => {
      timers.forEach(clearTimeout);
      container.remove();
    },
  };
};
