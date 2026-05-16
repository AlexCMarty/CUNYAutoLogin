import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_HEADLINE = "Finish signing in on your phone.";
const SCREEN_BODY =
  "Type your six-digit code on the CUNY tab to verify it’s you. We’ll wait here.";
const WAITING_LABEL =
  "Waiting for you to finish on the CUNY tab…";
const BACK_LABEL = "Back";

const STEPS = [
  { title: "Open your authenticator", desc: "Whatever app you usually use for the six-digit code." },
  { title: "Type the code into the CUNY tab", desc: "Same as you do today. We can’t help with this part — yet." },
  { title: "Come back here", desc: "Next we’ll set things up so you don’t have to do that again." },
] as const;

const buildStepCard = (doc: Document): HTMLElement => {
  const card = doc.createElement("div");
  card.className = "onboarding-step-card";
  STEPS.forEach((step, i) => {
    const row = doc.createElement("div");
    row.className = "onboarding-step-row";
    const num = doc.createElement("span");
    num.className = "onboarding-step-num";
    num.dataset.stepStatus = i === 0 ? "active" : "pending";
    num.textContent = String(i + 1);
    const body = doc.createElement("div");
    body.className = "onboarding-step-body";
    const title = doc.createElement("span");
    title.className = "onboarding-step-title";
    title.textContent = step.title;
    const desc = doc.createElement("span");
    desc.className = "onboarding-step-desc";
    desc.textContent = step.desc;
    body.appendChild(title);
    body.appendChild(desc);
    row.appendChild(num);
    row.appendChild(body);
    card.appendChild(row);
  });
  return card;
};

export const mountCunyTotpScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, dispatch } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "CUNY_TOTP";
  container.className = "onboarding-screen onboarding-screen-cuny-totp";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = SCREEN_HEADLINE;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = SCREEN_BODY;

  const stepCard = buildStepCard(doc);

  const pulseWrap = doc.createElement("div");
  pulseWrap.className = "onboarding-pulse-wrap";
  pulseWrap.setAttribute("aria-hidden", "true");
  const pulse = doc.createElement("span");
  pulse.className = "onboarding-pulse";
  pulseWrap.appendChild(pulse);

  const waiting = doc.createElement("p");
  waiting.className = "onboarding-waiting-label";
  waiting.textContent = WAITING_LABEL;

  const back = doc.createElement("button");
  back.type = "button";
  back.dataset.onboardingCunyTotpBack = "true";
  back.className = "onboarding-back secondary";
  back.textContent = BACK_LABEL;

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions onboarding-actions-single";
  actions.appendChild(back);

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(stepCard);
  container.appendChild(pulseWrap);
  container.appendChild(waiting);
  container.appendChild(actions);
  root.appendChild(container);

  const handleBack = (): void => {
    dispatch("BACK");
  };
  back.addEventListener("click", handleBack);

  return {
    unmount: () => {
      back.removeEventListener("click", handleBack);
      container.remove();
    },
  };
};
