/**
 * KEY_FROM_OTHER_DEVICE — "I've used CUNYAutoLogin before" (bead 3).
 *
 * Paste the secret key exported from CUNYAutoLogin on another computer. Shares
 * all behaviour with KEY_FROM_AUTH_APP via `mountPasteKeyScreen`; only the copy
 * differs. The "Show my secret key" export it references is a separate task
 * (advanced-key-flow.md §10) — instruction copy assumes it will exist.
 */

import { mountPasteKeyScreen, type PasteKeyCopy } from "./pasteKeyScreen";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const COPY: PasteKeyCopy = {
  state: "KEY_FROM_OTHER_DEVICE",
  screenModifier: "onboarding-screen-paste-key",
  headline: "Paste your secret key.",
  body: "Copy the key from CUNYAutoLogin on your other computer, then paste it here.",
  accordionSummary: "Where do I find it?",
  steps: [
    ["Unlock CUNYAutoLogin on your other computer."],
    ["Open your vault and choose ", { strong: "Show my secret key" }, "."],
    ["Copy the key and paste it below."],
  ],
};

export const mountKeyFromOtherDeviceScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => mountPasteKeyScreen(ctx, COPY);
