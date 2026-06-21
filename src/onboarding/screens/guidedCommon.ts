import browser from "webextension-polyfill";
import type { OnboardingOverlayCommand, TargetSpec } from "../messages";

/**
 * Builds the shared guided-screen `<section>` with its headline, body, and TabHint
 * already appended. Callers append any screen-specific elements, the recovery
 * messages, and the step-progress bar before mounting it on `root`.
 */
export const createGuidedScreenContainer = (
  doc: Document,
  opts: {
    readonly screen: string;
    readonly headline: string;
    readonly body: string;
    readonly tabHint: string;
  }
): HTMLElement => {
  const container = doc.createElement("section");
  container.dataset.onboardingScreen = opts.screen;
  container.className = "onboarding-screen onboarding-screen-guided";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = opts.headline;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = opts.body;

  container.appendChild(headline);
  container.appendChild(body);
  appendTabHint(doc, container, opts.tabHint);
  return container;
};

/**
 * Appends the three standard recovery/error messages shared by every guided RUI
 * screen (five-factor limit, verify-later, generic highlight failure). All start
 * hidden and are revealed by the overlay/recovery logic on the CUNY tab.
 */
export const appendGuidedRecoveryMessages = (doc: Document, container: HTMLElement): void => {
  const fiveLimit = doc.createElement("p");
  fiveLimit.dataset.onboardingFiveFactorLimit = "true";
  fiveLimit.className = "onboarding-recovery-message";
  fiveLimit.hidden = true;
  fiveLimit.textContent =
    "CUNY allows at most five Mobile Authenticator factors (limit reached). Remove or rename an existing factor on the CUNY tab before adding another. The extension cannot delete factors for you.";

  const verifyLater = doc.createElement("p");
  verifyLater.dataset.onboardingVerifyLaterRecovery = "true";
  verifyLater.className = "onboarding-recovery-message";
  verifyLater.hidden = true;
  verifyLater.textContent =
    "Your login method was saved but not verified yet. On the CUNY tab, open the menu on the CUNYAutoLogin factor and choose Verify to finish setting it up.";

  const recovery = doc.createElement("p");
  recovery.dataset.onboardingRecoveryMessage = "true";
  recovery.className = "onboarding-recovery-message";
  recovery.hidden = true;
  recovery.textContent =
    "We could not highlight the next control on the CUNY tab. Please follow the steps there manually.";

  container.appendChild(fiveLimit);
  container.appendChild(verifyLater);
  container.appendChild(recovery);
};

/** Builds and appends the "↗ We've highlighted the next control" TabHint card. */
export const appendTabHint = (doc: Document, container: HTMLElement, text: string): void => {
  const hint = doc.createElement("p");
  hint.className = "onboarding-directional";
  hint.textContent = text;
  container.appendChild(hint);
};

/** Builds and appends a step-N-of-total progress bar at the bottom of a container. */
export const appendStepProgress = (
  doc: Document,
  container: HTMLElement,
  current: number,
  total: number
): void => {
  const wrap = doc.createElement("div");
  wrap.className = "onboarding-step-progress";
  const sub = doc.createElement("p");
  sub.className = "onboarding-sub";
  sub.textContent = `Step ${current} of ${total}`;
  const barWrap = doc.createElement("div");
  barWrap.className = "onboarding-step-progress-bar";
  const fill = doc.createElement("div");
  fill.className = "onboarding-step-progress-fill";
  fill.style.width = `${(current / total) * 100}%`;
  barWrap.appendChild(fill);
  wrap.appendChild(sub);
  wrap.appendChild(barWrap);
  container.appendChild(wrap);
};

export const sendShowOverlayCommand = (opts: {
  readonly targetSpec: TargetSpec;
  readonly tooltipText: string;
  readonly stepIndex: number;
  readonly stepTotal: number;
}): void => {
  const command: OnboardingOverlayCommand = {
    type: "ONBOARDING_OVERLAY_COMMAND",
    action: "show",
    targetSpec: opts.targetSpec,
    tooltipText: opts.tooltipText,
    stepIndex: opts.stepIndex,
    stepTotal: opts.stepTotal,
  };
  void browser.runtime.sendMessage(command).catch(() => undefined);
};

export const sendHideOverlayCommand = (): void => {
  const command: OnboardingOverlayCommand = {
    type: "ONBOARDING_OVERLAY_COMMAND",
    action: "hide",
  };
  void browser.runtime.sendMessage(command).catch(() => undefined);
};
