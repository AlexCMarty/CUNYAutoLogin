import browser from "webextension-polyfill";
import type { OnboardingOverlayCommand, TargetSpec } from "../messages";

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
