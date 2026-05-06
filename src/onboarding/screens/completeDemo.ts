import browser from "webextension-polyfill";
import type { OnboardingReopenCunyTab } from "../messages";
import { BRIGHTSPACE_HOME_URL } from "../../cuny/ssoSite";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const DEMO_STEPS = [
  "Opening CUNY Login…",
  "Filling in your email…",
  "Filling in your password…",
  "Generating your login code…",
  "Signed in.",
] as const;

const STEP_INTERVAL_MS = 1_500;

type DemoRefs = {
  dotEls: HTMLElement[];
  textEls: HTMLElement[];
  statusEl: HTMLElement;
  actions: HTMLElement;
};

const buildDemoList = (doc: Document): { list: HTMLElement } & DemoRefs => {
  const list = doc.createElement("div");
  list.className = "onboarding-demo-list";
  const dotEls: HTMLElement[] = [];
  const textEls: HTMLElement[] = [];
  DEMO_STEPS.forEach((step) => {
    const row = doc.createElement("div");
    row.className = "onboarding-demo-row";
    const dot = doc.createElement("span");
    dot.className = "onboarding-demo-dot";
    const text = doc.createElement("span");
    text.className = "onboarding-demo-text";
    text.textContent = step;
    row.appendChild(dot);
    row.appendChild(text);
    list.appendChild(row);
    dotEls.push(dot);
    textEls.push(text);
  });
  const statusEl = doc.createElement("p");
  statusEl.className = "onboarding-demo-status";
  statusEl.dataset.onboardingDemoStatus = "true";
  statusEl.hidden = true;
  const actions = doc.createElement("div");
  return { list, dotEls, textEls, statusEl, actions };
};

const animateStep = (refs: DemoRefs, stepIdx: number): void => {
  refs.dotEls.forEach((dot, dotIdx) => {
    dot.dataset.active = dotIdx === stepIdx ? "true" : "false";
    dot.dataset.done = dotIdx < stepIdx ? "true" : "false";
  });
  refs.textEls.forEach((text, textIdx) => {
    text.dataset.active = textIdx === stepIdx ? "true" : "false";
  });
};

const finishAnimation = (
  refs: DemoRefs,
  dispatch: OnboardingScreenContext["dispatch"],
  doc: Document
): void => {
  refs.dotEls.forEach((dot) => {
    dot.dataset.active = "false";
    dot.dataset.done = "true";
  });
  refs.statusEl.hidden = false;
  refs.statusEl.textContent = "Watch the CUNY tab — we're doing the work.";
  const doneBtn = doc.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "onboarding-btn onboarding-btn-primary";
  doneBtn.textContent = "Done";
  doneBtn.addEventListener("click", () => dispatch("DEMO_FINISHED"));
  refs.actions.replaceChildren(doneBtn);
};

export const mountCompleteDemoScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root, dispatch } = ctx;
  const timers: ReturnType<typeof setTimeout>[] = [];

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

  const { list, dotEls, textEls, statusEl, actions } = buildDemoList(doc);
  container.appendChild(list);
  container.appendChild(statusEl);

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

  actions.className = "onboarding-actions";
  actions.style.flexDirection = "column";
  actions.style.gap = "8px";
  actions.appendChild(showBtn);
  actions.appendChild(skipBtn);
  container.appendChild(actions);

  const refs: DemoRefs = { dotEls, textEls, statusEl, actions };

  showBtn.addEventListener("click", () => {
    showBtn.disabled = true;
    skipBtn.hidden = true;
    const msg: OnboardingReopenCunyTab = {
      type: "ONBOARDING_REOPEN_CUNY_TAB",
      url: BRIGHTSPACE_HOME_URL,
    };
    void browser.runtime.sendMessage(msg).catch(() => undefined);
    dispatch("DEMO_REQUESTED");
    DEMO_STEPS.forEach((_step, stepIdx) => {
      timers.push(setTimeout(() => animateStep(refs, stepIdx), stepIdx * STEP_INTERVAL_MS));
    });
    timers.push(setTimeout(() => finishAnimation(refs, dispatch, doc), DEMO_STEPS.length * STEP_INTERVAL_MS));
  });

  root.appendChild(container);
  return {
    unmount: () => {
      timers.forEach(clearTimeout);
      container.remove();
    },
  };
};
