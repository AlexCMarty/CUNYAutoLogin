import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

export const mountCompleteDoneScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "COMPLETE_DONE";
  container.className = "onboarding-screen onboarding-screen-complete-done";

  const h2 = doc.createElement("h2");
  h2.className = "onboarding-headline";
  h2.textContent = "You're all set!";
  container.appendChild(h2);

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = "That's it. Enjoy never logging in manually again.";
  container.appendChild(body);

  root.appendChild(container);
  return { unmount: () => container.remove() };
};
