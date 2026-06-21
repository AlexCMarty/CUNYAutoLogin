/**
 * First guided step on factors list — student adds a factor next.
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

const HEADLINE = "Add a login code on the CUNY tab.";
const BODY =
  "On the CUNY tab, click Add Authentication Factor to continue.";
const TAB_HINT = "We've highlighted the next control on the CUNY tab.";

export const mountGuidedManageScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;

  const container = createGuidedScreenContainer(doc, {
    screen: "GUIDED_MANAGE",
    headline: HEADLINE,
    body: BODY,
    tabHint: TAB_HINT,
  });
  appendGuidedRecoveryMessages(doc, container);
  appendStepProgress(doc, container, 2, 8);
  root.appendChild(container);

  sendShowOverlayCommand({
    targetSpec: { type: "css", selector: RUI_ADD_MENU_SELECTOR },
    tooltipText: "Click Add Authentication Factor",
    stepIndex: 2,
    stepTotal: 8,
  });

  return {
    unmount: () => {
      sendHideOverlayCommand();
      container.remove();
    },
  };
};
