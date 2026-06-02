/**
 * KEY_FROM_AUTH_APP — "I use a 2FA app" / advanced setup (bead 3).
 *
 * Import the CUNY login key from an existing authenticator app (Bitwarden,
 * Aegis, Ente Auth, …). Structurally identical to KEY_FROM_OTHER_DEVICE; only
 * the copy differs (advanced-key-flow.md §2).
 */

import { mountPasteKeyScreen, type PasteKeyCopy } from "./pasteKeyScreen";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const COPY: PasteKeyCopy = {
  state: "KEY_FROM_AUTH_APP",
  screenModifier: "onboarding-screen-paste-key",
  headline: "Paste your secret key.",
  body: "Open the authenticator app you already use and copy the key for your CUNY login.",
  accordionSummary: "Where do I find it?",
  steps: [
    ["Open your 2FA app and find your CUNY login."],
    ["Edit it, or open its details."],
    [
      "Copy the field labeled ",
      { strong: "Secret Key" },
      " or ",
      { strong: "Authenticator Key" },
      ".",
    ],
  ],
};

export const mountKeyFromAuthAppScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => mountPasteKeyScreen(ctx, COPY);
