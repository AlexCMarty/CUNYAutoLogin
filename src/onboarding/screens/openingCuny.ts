/**
 * Screen 4 — "Opening CUNY…" transition.
 *
 * Spec reference: `overhaul-onboarding.md §Screen 4`.
 *
 * Behavior on mount:
 *   1. Stage the in-memory email+password into the service worker's ephemeral
 *      cache via `STAGE_ONBOARDING_CREDENTIALS`. The content script asks for
 *      credentials via the existing `AUTO_FILL_REQUEST` flow, which falls back
 *      to this staged payload when the vault isn't set up yet (pre-vault).
 *   2. Open the CUNY entry URL in a new tab directly from the sidebar via
 *      `browser.tabs.create(...)`. The URL defaults to
 *      `https://ssologin.cuny.edu/oaa/rui` (per spec); dev/e2e builds allow an
 *      override via the `#cuny=<encoded url>` hash param so the fixture server
 *      can stand in for CUNY.
 *
 *      We intentionally do NOT route this through the service worker's
 *      `ONBOARDING_REOPEN_CUNY_TAB` handler from the sidebar path. In Chrome
 *      MV3 the side panel + dormant service worker combination races the
 *      sendMessage wakeup: the panel would post the reopen message, the SW
 *      would cold-start, and the message could resolve without the tab ever
 *      being created. Sidebars are extension pages with full `browser.tabs`
 *      access, so opening the tab locally is both simpler and more reliable.
 *      The SW-side handler remains registered (see `service-worker.ts`) so
 *      other surfaces — e.g. the content script asking for a reopen after a
 *      session drop — can still use the wire protocol.
 *
 * Back button: per spec returns to Screen 3 (PASSWORD_ENTRY). No forward
 * button — advance is driven by the bridge listener in `render.ts` once the
 * content script emits `ONBOARDING_CREDENTIAL_ERROR` or
 * `ONBOARDING_STAGE_DETECTED{stage:"allow_gate"}`.
 *
 * Security: this module never persists credentials. It only passes them once
 * across the runtime port into the service worker, which also holds them in
 * memory only. The sidebar unmount path fires `CLEAR_ONBOARDING_CREDENTIALS`
 * to drop the service-worker copy as well.
 */

import browser from "webextension-polyfill";
import { CUNY_LOGIN_ENTRY_URL } from "../../cuny/ssoSite";
import type { StageOnboardingCredentials } from "../messages";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const SCREEN_HEADLINE = "Opening CUNY Login\u2026";
const SCREEN_BODY =
  "We're opening your school's login page in a new tab. We'll fill in your email and password so you can see how the extension works.";
const DIRECTIONAL_LINE =
  "Watch the CUNY tab. These instructions update on their own as you go.";
const REASSURANCE_COPY =
  "This is the same page you'd visit normally. We're not taking you anywhere unexpected.";
const WAITING_LABEL = "Nothing to do yet \u2014 waiting for the tab to open.";
const BACK_LABEL = "Back";

export const OPENING_CUNY_SCREEN_SELECTOR =
  "[data-onboarding-screen='OPENING_CUNY']";
export const OPENING_CUNY_BACK_SELECTOR =
  "[data-onboarding-opening-back='true']";
export const OPENING_CUNY_WAITING_SELECTOR =
  "[data-onboarding-opening-waiting='true']";

const DEV_MODE_NAMES = ["development", "e2e"] as const;

/**
 * Dev/e2e escape hatch: the URL hash may contain `cuny=<encoded>` to override
 * the CUNY entry URL. Production always uses `CUNY_LOGIN_ENTRY_URL` — this
 * branch folds away under production `mode` (static Vite replacement).
 */
const resolveCunyEntryUrl = (): string => {
  if (
    typeof window === "undefined" ||
    !(DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE)
  ) {
    return CUNY_LOGIN_ENTRY_URL;
  }
  try {
    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    const override = params.get("cuny");
    if (override && override.length > 0) return override;
  } catch {
    // Non-parseable hash — fall through to default.
  }
  return CUNY_LOGIN_ENTRY_URL;
};

/**
 * In production we swallow messaging failures so the UI stays usable even if
 * the extension was reloaded or the SW was torn down. In dev/e2e we surface
 * them to the sidebar DevTools console — silent failures on this path are
 * how the original Chrome side-panel hang went unnoticed.
 */
const reportScreen4Failure = (where: string, error: unknown): void => {
  if (
    typeof console !== "undefined" &&
    (DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE)
  ) {
    // eslint-disable-next-line no-console
    console.warn(`[onboarding/opening-cuny] ${where} failed:`, error);
  }
};

const sendRuntimeMessage = async (
  message: unknown,
  where: string
): Promise<boolean> => {
  try {
    await browser.runtime.sendMessage(message);
    return true;
  } catch (error) {
    reportScreen4Failure(where, error);
    return false;
  }
};

const openCunyTab = async (url: string): Promise<void> => {
  try {
    await browser.tabs.create({ url, active: true });
  } catch (error) {
    reportScreen4Failure("browser.tabs.create", error);
  }
};

export const mountOpeningCunyScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, dispatch, getSnapshot } = ctx;

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "OPENING_CUNY";
  container.className = "onboarding-screen onboarding-screen-opening";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = SCREEN_HEADLINE;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = SCREEN_BODY;

  const directional = doc.createElement("p");
  directional.className = "onboarding-directional";
  directional.textContent = DIRECTIONAL_LINE;

  const reassurance = doc.createElement("p");
  reassurance.className = "onboarding-reassurance";
  reassurance.textContent = REASSURANCE_COPY;

  // Pulsing animation + label. Spec: "Pulsing animation. Label beneath it:
  // 'Nothing to do yet — waiting for the tab to open.'" The label removes the
  // ambiguity of a bare pulse (which could read as "you need to do
  // something"). We keep the pulse CSS-driven so jsdom doesn't need timers.
  const pulseWrap = doc.createElement("div");
  pulseWrap.className = "onboarding-pulse-wrap";
  pulseWrap.setAttribute("aria-hidden", "true");
  const pulse = doc.createElement("span");
  pulse.className = "onboarding-pulse";
  pulseWrap.appendChild(pulse);

  const waiting = doc.createElement("p");
  waiting.dataset.onboardingOpeningWaiting = "true";
  waiting.className = "onboarding-waiting-label";
  waiting.textContent = WAITING_LABEL;

  const back = doc.createElement("button");
  back.type = "button";
  back.dataset.onboardingOpeningBack = "true";
  back.className = "onboarding-back secondary";
  back.textContent = BACK_LABEL;

  const actions = doc.createElement("div");
  actions.className = "onboarding-actions onboarding-actions-single";
  actions.appendChild(back);

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(directional);
  container.appendChild(reassurance);
  container.appendChild(pulseWrap);
  container.appendChild(waiting);
  container.appendChild(actions);
  root.appendChild(container);

  // Kick off the tab-open side effects. Order: stage credentials BEFORE the
  // tab opens — otherwise a very fast content-script bootstrap could hit the
  // AUTO_FILL_REQUEST path before the SW has the staged payload.
  const snapshot = getSnapshot();
  const stagePayload: StageOnboardingCredentials = {
    type: "STAGE_ONBOARDING_CREDENTIALS",
    email: snapshot.email,
    password: snapshot.password,
  };
  const cunyUrl = resolveCunyEntryUrl();
  void (async () => {
    const staged = await sendRuntimeMessage(stagePayload, "STAGE_ONBOARDING_CREDENTIALS");
    await openCunyTab(cunyUrl);
    if (!staged) {
      await sendRuntimeMessage(stagePayload, "STAGE_ONBOARDING_CREDENTIALS.retry");
    }
  })();

  const handleBack = (): void => {
    dispatch("BACK");
  };
  back.addEventListener("click", handleBack);

  return {
    unmount: () => {
      back.removeEventListener("click", handleBack);
      container.remove();
    },
  };
};
