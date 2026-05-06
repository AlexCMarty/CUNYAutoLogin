import browser from "webextension-polyfill";
import { showOnboardingIllustrationPlaceholders } from "../illustrationPlaceholders";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const FEATURES = [
  ["Stays on this device", "Nothing leaves your computer."],
  ["Locked behind your password", "Only you can open the vault."],
  ["Works on your CUNY sign-in", "And anything that signs you in through it."],
] as const;

type BrowserWithSidebarClose = typeof browser & {
  sidebarAction?: {
    close?: () => Promise<void>;
  };
  sidePanel?: {
    close?: (options: { windowId: number }) => Promise<void>;
  };
};

const dismissSidebarPanel = async (): Promise<void> => {
  const browserWithSidebarClose = browser as BrowserWithSidebarClose;
  if (typeof browserWithSidebarClose.sidebarAction?.close === "function") {
    await browserWithSidebarClose.sidebarAction.close();
    return;
  }
  if (typeof browserWithSidebarClose.sidePanel?.close === "function") {
    const currentWindow = await browser.windows.getCurrent();
    if (typeof currentWindow.id === "number") {
      await browserWithSidebarClose.sidePanel.close({ windowId: currentWindow.id });
      return;
    }
  }
  window.close();
};

export const mountCompleteDoneScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "COMPLETE_DONE";
  container.className = "onboarding-screen onboarding-screen-complete-done";

  const h2 = doc.createElement("h2");
  h2.className = "onboarding-headline";
  h2.style.fontSize = "26px";
  h2.textContent = "You're set.";

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent =
    "From now on, signing into CUNY happens automatically — email, password, and the six-digit code, filled for you while the vault is unlocked.";

  const featureCard = doc.createElement("div");
  featureCard.className = "onboarding-feature-card";
  FEATURES.forEach(([title, desc]) => {
    const row = doc.createElement("div");
    row.className = "onboarding-feature-row";
    const titleEl = doc.createElement("span");
    titleEl.className = "onboarding-feature-title";
    titleEl.textContent = title;
    const descEl = doc.createElement("span");
    descEl.className = "onboarding-feature-body";
    descEl.textContent = desc;
    row.appendChild(titleEl);
    row.appendChild(descEl);
    featureCard.appendChild(row);
  });

  const cta = doc.createElement("button");
  cta.type = "button";
  cta.className = "onboarding-btn onboarding-btn-primary";
  cta.textContent = "Get back to studying!";
  cta.addEventListener("click", () => {
    void dismissSidebarPanel().catch(() => {
      window.close();
    });
  });

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions";
  actions.appendChild(cta);

  if (showOnboardingIllustrationPlaceholders) {
    const placeholder = doc.createElement("div");
    placeholder.className = "onboarding-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = "// confetti · graduation cap";
    container.appendChild(placeholder);
  }
  container.appendChild(h2);
  container.appendChild(body);
  container.appendChild(featureCard);
  container.appendChild(actions);

  root.appendChild(container);
  return { unmount: () => container.remove() };
};
