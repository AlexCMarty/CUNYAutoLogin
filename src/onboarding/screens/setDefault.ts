import browser from "webextension-polyfill";
import { ENROLLED_FACTOR_ALIAS_SESSION_KEY, EXTENSION_NAME } from "../../cuny/ssoSite";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import { appendStepProgress, appendTabHint, sendHideOverlayCommand, sendShowOverlayCommand } from "./guidedCommon";

const TAB_HINT = "We've highlighted the next control on the CUNY tab.";

export const showSetDefaultOptionOverlay = (): void => {
  sendShowOverlayCommand({
    targetSpec: { type: "a11y", text: "Set as Default" },
    tooltipText: "Click Set as Default",
    stepIndex: 8,
    stepTotal: 8,
  });
};

export const mountSetDefaultScreen: ScreenMount = (ctx: OnboardingScreenContext) => {
  const { doc, root } = ctx;
  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "SET_DEFAULT";
  container.className = "onboarding-screen onboarding-screen-guided";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = `Make ${EXTENSION_NAME} your default method.`;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent =
    `On the CUNY tab, open the ${EXTENSION_NAME} menu, then select Set as Default.`;

  const recovery = doc.createElement("p");
  recovery.dataset.onboardingRecoveryMessage = "true";
  recovery.className = "onboarding-recovery-message";
  recovery.hidden = true;
  recovery.textContent =
    `We could not find the Set as Default action. Open the ${EXTENSION_NAME} menu and choose Set as Default manually.`;

  container.append(headline, body);
  appendTabHint(doc, container, TAB_HINT);
  container.append(recovery);
  appendStepProgress(doc, container, 7, 8);
  root.appendChild(container);

  // Read the enrolled alias from session so the recovery text names the
  // exact factor the user just created (e.g. "CUNYAutoLogin-a3f2") rather than
  // the generic constant, which may ambiguously match an older factor.
  // UI text uses EXTENSION_NAME name because those four random letters 
  // look out of place & will scare users "why is this so complicated!"
  void (async () => {
    let alias: string = EXTENSION_NAME;
    try {
      const got = await browser.storage.session?.get(ENROLLED_FACTOR_ALIAS_SESSION_KEY);
      const stored = got?.[ENROLLED_FACTOR_ALIAS_SESSION_KEY];
      if (typeof stored === "string" && stored.length > 0) alias = stored;
    } catch {
      // storage.session unavailable — keep the generic name
    }

    headline.textContent = `Make ${EXTENSION_NAME} your default method.`;
    body.textContent = `On the CUNY tab, open the ${EXTENSION_NAME} menu, then select Set as Default.`;
    recovery.textContent =
      `We could not find the Set as Default action. Open the ${alias} menu and choose Set as Default manually.`;

    sendShowOverlayCommand({
      targetSpec: {
        type: "css",
        selector: `factor-panel[factor*="${alias}"] oj-menu-button.oj-button-sm button`,
      },
      tooltipText: "Open this menu",
      stepIndex: 7,
      stepTotal: 8,
    });
  })();

  return {
    unmount: () => {
      sendHideOverlayCommand();
      container.remove();
    },
  };
};
