/**
 * TEST_LOGIN — a real CUNY auto-login that proves the pasted key works
 * (bead 3). Reuses the shared login checklist (loginChecklist.ts) so it stays
 * in lockstep with COMPLETE_DEMO; only the first step's wording differs.
 *
 * On mount this screen:
 *   1. Sends LOGOUT_CUNY_SESSIONS to terminate any existing OAA session.
 *   2. Stages email + password via STAGE_ONBOARDING_CREDENTIALS so the
 *      content script can auto-fill them.
 *   3. Opens Brightspace in a new tab (SAML flow hits ssologin for autofill,
 *      then redirects back to Brightspace on success — no allow gate).
 *
 * As the login runs, the content script emits ONBOARDING_LOGIN_PROGRESS events
 * and the sidebar synthesises `signed_in` from Brightspace cookie detection;
 * the render bridge forwards them to this screen's `onMessage`, advancing the
 * beads. Beads advance only on these real events — nothing is timed — and
 * "Signed in" completes only on the real success (which then transitions to
 * EXT_PASSWORD_SETUP). The render bridge also drives the failure branches:
 *   - ONBOARDING_CREDENTIAL_ERROR while in TEST_LOGIN → TEST_BAD_CREDENTIALS
 *   - ONBOARDING_VERIFY_STATUS second_failure while in TEST_LOGIN → TEST_BAD_KEY
 *
 * `qaVariant=success` shows the static signed-in frame; default animates the
 * in-progress frame.
 */

import browser from "webextension-polyfill";
import { BRIGHTSPACE_HOME_URL } from "../../cuny/ssoSite";
import type { LogoutCunySessionsRequest, StageOnboardingCredentials } from "../messages";
import { DEV_MODE_NAMES } from "../devModes";
import { buildLoginChecklist } from "./loginChecklist";
import type { OnboardingScreenContext, ScreenMount } from "./screenContext";

const isDevMode = (): boolean =>
  (DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE);

const reportTestLoginFailure = (where: string, error: unknown): void => {
  if (!isDevMode()) return;
  // eslint-disable-next-line no-console
  console.warn(`[onboarding/test-login] ${where} failed:`, error);
};

const resolveCunyEntryUrl = (): string => {
  if (!isDevMode() || typeof window === "undefined") return BRIGHTSPACE_HOME_URL;
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const override = params.get("cuny");
    if (override && override.length > 0) return override;
  } catch { /* fall through */ }
  return BRIGHTSPACE_HOME_URL;
};

const STEPS = [
  "Opening Brightspace",
  "Filling in your email / password",
  "Filling in your login code",
  "Signed in",
] as const;

const HEADLINE_PROGRESS = "Let's make sure it works.";
const HEADLINE_SUCCESS = "Your key works.";
const BODY_PROGRESS =
  "We're signing into Brightspace in a new tab using your key. Nothing for " +
  "you to do — just watch.";
const BODY_SUCCESS =
  "We signed into Brightspace with your key. Next we'll seal everything into " +
  "your vault.";
const DEMO_STATUS_PROGRESS = "Watch the new tab — we're doing the work.";
const STATUS_SUCCESS = "Signed in. Saving your vault…";

const buildSuccessStatus = (doc: Document): HTMLElement => {
  const status = doc.createElement("p");
  status.className = "onboarding-status";
  const check = doc.createElement("span");
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";
  const statusText = doc.createElement("span");
  statusText.textContent = STATUS_SUCCESS;
  status.appendChild(check);
  status.appendChild(statusText);
  return status;
};

const buildProgressStatus = (doc: Document): HTMLElement => {
  const demoStatus = doc.createElement("p");
  demoStatus.className = "onboarding-demo-status";
  demoStatus.textContent = DEMO_STATUS_PROGRESS;
  return demoStatus;
};

/** Fire the real login: clear session, stage credentials, open Brightspace. */
const runTestLoginSideEffects = (email: string, password: string): void => {
  const logoutPayload: LogoutCunySessionsRequest = { type: "LOGOUT_CUNY_SESSIONS" };
  const stagePayload: StageOnboardingCredentials = {
    type: "STAGE_ONBOARDING_CREDENTIALS",
    email,
    password,
  };
  const cunyUrl = resolveCunyEntryUrl();
  void (async () => {
    try { await browser.runtime.sendMessage(logoutPayload); } catch (err) {
      reportTestLoginFailure("LOGOUT_CUNY_SESSIONS", err);
    }
    try { await browser.runtime.sendMessage(stagePayload); } catch (err) {
      reportTestLoginFailure("STAGE_ONBOARDING_CREDENTIALS", err);
    }
    try { await browser.tabs.create({ url: cunyUrl, active: true }); } catch (err) {
      reportTestLoginFailure("tabs.create", err);
    }
  })();
};

export const mountTestLoginScreen: ScreenMount = (
  ctx: OnboardingScreenContext
) => {
  const { doc, root, qaVariant, getSnapshot } = ctx;
  const success = qaVariant === "success";

  const container = doc.createElement("section");
  container.dataset.onboardingScreen = "TEST_LOGIN";
  container.dataset.onboardingTestPhase = success ? "success" : "progress";
  container.className = "onboarding-screen onboarding-screen-test-login";

  const headline = doc.createElement("h2");
  headline.className = "onboarding-headline";
  headline.textContent = success ? HEADLINE_SUCCESS : HEADLINE_PROGRESS;

  const body = doc.createElement("p");
  body.className = "onboarding-body";
  body.textContent = success ? BODY_SUCCESS : BODY_PROGRESS;

  const checklist = buildLoginChecklist(doc, STEPS);

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(checklist.element);
  container.appendChild(success ? buildSuccessStatus(doc) : buildProgressStatus(doc));

  if (success) {
    checklist.finishAll();
  } else {
    // Real proof: bead 0 ("Opening Brightspace") spins until the content script
    // reports the first real event. "Signed in" is held until the actual success
    // (cookie → `signed_in`, which then navigates to EXT_PASSWORD_SETUP).
    checklist.begin();
  }

  root.appendChild(container);

  // The QA screenshot variant (`qaVariant=success`) renders a finished frame and
  // must stay visual-only — never fire a real login (logout + credential staging +
  // opening a CUNY tab) from a dev capture/jump.
  if (!success) {
    const snapshot = getSnapshot();
    runTestLoginSideEffects(snapshot.email, snapshot.password);
  }

  return {
    unmount: () => {
      checklist.unmount();
      container.remove();
    },
    onMessage: (message) => checklist.applyMessage(message),
  };
};
