import { EXTENSION_NAME } from "../../cuny/ssoSite";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";
import { sendHideOverlayCommand, sendShowOverlayCommand } from "./guidedCommon";

// Scope to the CUNYAutoLogin factor-panel so the overlay does not anchor on
// another factor's kebab. The `factor` attribute is JSON; substring match on
// the alias is safe because alias text is unique within that payload.
// Scope to the CUNYAutoLogin factor-panel so the overlay does not anchor on
// another factor's kebab. The `factor` attribute is JSON; substring match on
// the alias is safe because alias text is unique within that payload. Target
// the inner <button> so the tooltip anchors on the clickable element.
const KEBAB_SELECTOR =
  `factor-panel[factor*="${EXTENSION_NAME}"] oj-menu-button.oj-button-sm button`;

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
  headline.textContent = `Make ${EXTENSION_NAME} your default method`;

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

  container.append(headline, body, recovery);
  root.appendChild(container);

  sendShowOverlayCommand({
    targetSpec: { type: "css", selector: KEBAB_SELECTOR },
    tooltipText: "Open this menu",
    stepIndex: 7,
    stepTotal: 8,
  });

  return {
    unmount: () => {
      sendHideOverlayCommand();
      container.remove();
    },
  };
};
