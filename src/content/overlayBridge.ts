import browser from "webextension-polyfill";
import type { OnboardingOverlayCommand, OnboardingStageDetected } from "../onboarding/messages";
import { hideOverlay, showOverlay } from "./overlay";

/**
 * Plan-06: execute an overlay command received from the service worker.
 * Called both from the ONBOARDING_CONTENT_SCRIPT_READY response (pull on
 * page load) and from the runtime.onMessage listener (push mid-session).
 */
export const executeOverlayCommand = (command: OnboardingOverlayCommand): void => {
  if (command.action === "hide") {
    hideOverlay();
    return;
  }
  if (command.action !== "show") {
    return;
  }
  const spec =
    command.targetSpec ??
    (command.target ? ({ type: "css" as const, selector: command.target } as const) : null);
  if (!spec) return;
  void (async () => {
    const stageMessage: OnboardingStageDetected = {
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "target_not_found",
    };
    showOverlay(spec, command.tooltipText ?? "", command.stepIndex ?? 1, command.stepTotal ?? 1, () => {
      void browser.runtime.sendMessage(stageMessage).catch(() => undefined);
    });
  })();
};

/**
 * Plan-06: pull the current overlay command from the service worker when the
 * content script first loads. This handles the case where the sidebar entered
 * ALLOW_GATE before the CUNY tab navigated to the current page.
 */
export const requestAndExecuteOverlayCommand = async (): Promise<void> => {
  try {
    const response = (await browser.runtime.sendMessage({
      type: "ONBOARDING_CONTENT_SCRIPT_READY",
    })) as { overlayCommand: OnboardingOverlayCommand | null } | undefined;
    if (response?.overlayCommand) {
      executeOverlayCommand(response.overlayCommand);
    }
  } catch {
    // Extension not ready or messaging failed — overlay remains hidden.
  }
};
