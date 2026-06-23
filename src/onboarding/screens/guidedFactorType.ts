/**
 * Pick Mobile Authenticator (TOTP) from the open Oracle menu — a11y target required.
 */

import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import {
  appendGuidedRecoveryMessages,
  appendStepProgress,
  createGuidedScreenContainer,
  sendHideOverlayCommand,
  sendShowOverlayCommand,
} from "./guidedCommon";

const HEADLINE = "Choose Mobile Authenticator.";
const BODY =
  "In the menu on the CUNY tab, select Mobile Authenticator — TOTP.";
const TAB_HINT = "We've highlighted the next control on the CUNY tab.";

/** Exact menuitem label from `.map/pages/factors-list.md`. */
const TOTP_MENUITEM_TEXT = "Mobile Authenticator - TOTP";

export const mountGuidedFactorTypeScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;

  const container = createGuidedScreenContainer(doc, {
    screen: "GUIDED_FACTOR_TYPE",
    headline: HEADLINE,
    body: BODY,
    tabHint: TAB_HINT,
  });
  appendGuidedRecoveryMessages(doc, container);
  appendStepProgress(doc, container, 4, 8);
  root.appendChild(container);

  sendShowOverlayCommand({
    targetSpec: { type: "a11y", text: TOTP_MENUITEM_TEXT },
    tooltipText: TOTP_MENUITEM_TEXT,
    stepIndex: 4,
    stepTotal: 8,
  });

  return {
    unmount: () => {
      sendHideOverlayCommand();
      container.remove();
    },
  };
};
