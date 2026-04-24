import browser from "webextension-polyfill";
import type { OnboardingOverlayCommand, TargetSpec } from "../messages";

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
