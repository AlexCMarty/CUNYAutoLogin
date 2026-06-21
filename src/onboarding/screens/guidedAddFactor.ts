/**
 * Student opens the Add Authentication Factor menu (overlay on same control as manage step).
 */

import { RUI_ADD_MENU_SELECTOR } from "../../cuny/ssoSite";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import {
  appendGuidedRecoveryMessages,
  appendStepProgress,
  createGuidedScreenContainer,
  sendHideOverlayCommand,
  sendShowOverlayCommand,
} from "./guidedCommon";

const HEADLINE = "Open the add menu.";
const BODY =
  "On the CUNY tab, click Add Authentication Factor (if the menu is not already open).";
const TAB_HINT = "We've highlighted the next control on the CUNY tab.";

export const mountGuidedAddFactorScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;

  const container = createGuidedScreenContainer(doc, {
    screen: "GUIDED_ADD_FACTOR",
    headline: HEADLINE,
    body: BODY,
    tabHint: TAB_HINT,
  });
  appendGuidedRecoveryMessages(doc, container);
  appendStepProgress(doc, container, 3, 8);
  root.appendChild(container);

  sendShowOverlayCommand({
    targetSpec: { type: "css", selector: RUI_ADD_MENU_SELECTOR },
    tooltipText: "Add Authentication Factor",
    stepIndex: 3,
    stepTotal: 8,
  });

  return {
    unmount: () => {
      sendHideOverlayCommand();
      container.remove();
    },
  };
};
