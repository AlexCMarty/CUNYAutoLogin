/**
 * TEST_LOGIN — a real CUNY auto-login that proves the pasted key works
 * (bead 3). Reuses the COMPLETE_DEMO checklist look (row/dot/text classes).
 *
 * On mount this screen:
 *   1. Sends LOGOUT_CUNY_SESSIONS to terminate any existing OAA session.
 *   2. Stages email + password via STAGE_ONBOARDING_CREDENTIALS so the
 *      content script can auto-fill them.
 *   3. Opens Brightspace in a new tab (SAML flow hits ssologin for autofill,
 *      then redirects back to Brightspace on success — no allow gate).
 *
 * The render bridge in render.ts then drives the result:
 *   - Brightspace URL landing in tab → TEST_SUCCEEDED
 *   - ONBOARDING_CREDENTIAL_ERROR while in TEST_LOGIN → TEST_BAD_CREDENTIALS
 *   - ONBOARDING_VERIFY_STATUS second_failure while in TEST_LOGIN → TEST_BAD_KEY
 *
 * `qaVariant=success` shows the signed-in frame; default shows the
 * in-progress frame.
 */

import browser from "webextension-polyfill";
import { BRIGHTSPACE_HOME_URL } from "../../cuny/ssoSite";
import type { LogoutCunySessionsRequest, StageOnboardingCredentials } from "../messages";
import { DEV_MODE_NAMES } from "../devModes";
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
  "Filling in your email",
  "Filling in your password",
  "Generating your six-digit code",
  "Signed in",
] as const;

/** In-progress frame: rows 0–1 done, row 2 ("password") active. */
const IN_PROGRESS_ACTIVE_IDX = 2;

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

const buildChecklist = (doc: Document, success: boolean): HTMLElement => {
  const list = doc.createElement("div");
  list.className = "onboarding-demo-list";
  // success → all rows done; otherwise the active row sits at the password step.
  const activeIdx = success ? STEPS.length : IN_PROGRESS_ACTIVE_IDX;
  STEPS.forEach((step, idx) => {
    const done = idx < activeIdx;
    const active = idx === activeIdx;
    const row = doc.createElement("div");
    row.className = "onboarding-demo-row";
    const dot = doc.createElement("span");
    dot.className = "onboarding-demo-dot";
    dot.dataset.active = active ? "true" : "false";
    dot.dataset.done = done ? "true" : "false";
    const text = doc.createElement("span");
    text.className = "onboarding-demo-text";
    text.dataset.active = active ? "true" : "false";
    text.textContent = active && !success ? `${step}…` : step;
    row.appendChild(dot);
    row.appendChild(text);
    list.appendChild(row);
  });
  return list;
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

  container.appendChild(headline);
  container.appendChild(body);
  container.appendChild(buildChecklist(doc, success));

  if (success) {
    const status = doc.createElement("p");
    status.className = "onboarding-status";
    const check = doc.createElement("span");
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓"; // ✓
    const statusText = doc.createElement("span");
    statusText.textContent = STATUS_SUCCESS;
    status.appendChild(check);
    status.appendChild(statusText);
    container.appendChild(status);
  } else {
    const demoStatus = doc.createElement("p");
    demoStatus.className = "onboarding-demo-status";
    demoStatus.textContent = DEMO_STATUS_PROGRESS;
    container.appendChild(demoStatus);
  }

  root.appendChild(container);

  const snapshot = getSnapshot();
  const logoutPayload: LogoutCunySessionsRequest = { type: "LOGOUT_CUNY_SESSIONS" };
  const stagePayload: StageOnboardingCredentials = {
    type: "STAGE_ONBOARDING_CREDENTIALS",
    email: snapshot.email,
    password: snapshot.password,
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

  return {
    unmount: () => {
      container.remove();
    },
  };
};
