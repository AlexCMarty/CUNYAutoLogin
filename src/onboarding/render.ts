/**
 * Onboarding render contract + mount seam.
 *
 * Mounts the onboarding shell, screen, and runtime.onMessage bridge. The
 * message bridge lets the content script / service worker steer the sidebar:
 *
 *   - `ONBOARDING_CREDENTIAL_ERROR { culprit }` → route to EMAIL_ENTRY (if
 *     the email is the likely culprit) or PASSWORD_ENTRY (default), with a
 *     red inline banner surfaced above the affected input.
 *   - `ONBOARDING_STAGE_DETECTED { stage: "cuny_totp_challenge" }` → advance from
 *     OPENING_CUNY to CUNY_TOTP (CUNY is showing the TOTP challenge).
 *   - `ONBOARDING_STAGE_DETECTED { stage: "allow_gate" }` → advance from
 *     CUNY_TOTP to ALLOW_GATE (mfaConsent.jsp loaded).
 *
 * Security: email/password drafts live in the controller closure only (never
 * `storage.local`). Resumable onboarding states mirror email/password to
 * `browser.storage.session` under `cunyOnboardingResumeSnapshot` (see
 * `resumeSession.ts`), debounced — not `storage.local`. On sidebar unmount the
 * snapshot is flushed via the service worker so the write survives immediate
 * navigation away from the extension page. The unmount path also fires
 * `CLEAR_ONBOARDING_CREDENTIALS` so the service worker drops its
 * in-memory staging buffer. The runtime bridge ignores messages from other
 * extensions (`sender.id`) and rejects web frames that are not on the trusted
 * SSO / local E2E fixture host set.
 */

import browser from "webextension-polyfill";
import type { Runtime } from "webextension-polyfill";
import { mountBeadHeader } from "./beadHeader";
import {
  type OnboardingController,
  createOnboardingController,
} from "./controller";
import {
  type ClearOnboardingCredentials,
  type OnboardingLoginProgress,
  type OnboardingMessage,
  type OnboardingPageStage,
  type PersistOnboardingResumeSnapshot,
  isOnboardingMessage,
} from "./messages";
import {
  BRIGHTSPACE_SESSION_COOKIE_NAMES,
  PENDING_TOTP_SECRET_SESSION_KEY,
  isBrightspaceCookieDomain,
  isTrustedContentScriptMessageHostname,
} from "../cuny/ssoSite";
import { SCREEN_MOUNTS } from "./screenMounts";
import { showSetDefaultOptionOverlay } from "./screens/setDefault";
import type {
  OnboardingScreenContext,
  ScreenHandle,
} from "./screens/screenContext";
import { DEV_MODE_NAMES } from "./devModes";
import type { DevQaJumpParseResult } from "./devQaJump";
import {
  loadResumeSnapshotFromSession,
  persistOnboardingResumeSnapshot,
} from "./resumeSession";
import { type OnboardingState } from "./state";
import { type OnboardingEvent } from "./transitions";
import { routeByType } from "../runtime/messageRouter";

export { beadViewModelForState } from "./beadViewModel";

/** Dev QA deep link options — pass `qaJump` from `tryParseDevQaOnboardingJumpFromWindow`. */
export type MountOnboardingOptions = {
  readonly qaJump?: DevQaJumpParseResult;
};

export const ONBOARDING_ROOT_ID = "onboarding-root";
export const ONBOARDING_SCREEN_HOST_SELECTOR =
  "[data-onboarding-screen-host='true']";
export const ONBOARDING_PLACEHOLDER_SELECTOR =
  "[data-onboarding-placeholder='true']";
export const ONBOARDING_RESUME_BUTTON_SELECTOR = "[data-onboarding-resume='true']";
export const ONBOARDING_REOPEN_CUNY_SELECTOR = "[data-onboarding-reopen-cuny='true']";

type PendingResumeSnapshot = {
  readonly state: OnboardingState;
  readonly email: string;
  readonly password: string;
  readonly advancedKeyFlow: boolean;
};

const isDevMode = (): boolean =>
  (DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE);

/** Trailing debounce for resume snapshot writes (keystrokes coalesce). */
const RESUME_SNAPSHOT_DEBOUNCE_MS = 500;

const onboardingRuntimeBridgeSenderTrusted = (
  sender: Runtime.MessageSender
): boolean => {
  const frameUrl =
    typeof sender.url === "string" && sender.url.length > 0
      ? sender.url
      : typeof sender.tab?.url === "string" && sender.tab.url.length > 0
        ? sender.tab.url
        : null;
  if (frameUrl === null) {
    return false;
  }
  if (
    frameUrl.startsWith("chrome-extension://") ||
    frameUrl.startsWith("moz-extension://") ||
    frameUrl.startsWith("safari-web-extension://")
  ) {
    return true;
  }
  if (sender.tab === undefined) {
    return false;
  }
  try {
    return isTrustedContentScriptMessageHostname(new URL(frameUrl).hostname);
  } catch {
    return false;
  }
};

const reportOnboardingFailure = (where: string, error: unknown): void => {
  if (!isDevMode()) return;
  // eslint-disable-next-line no-console
  console.warn(`[onboarding/render] ${where} failed:`, error);
};

const mountPlaceholderScreen = (ctx: OnboardingScreenContext): ScreenHandle => {
  const container = ctx.doc.createElement("section");
  container.dataset.onboardingPlaceholder = "true";
  container.className = "onboarding-screen onboarding-screen-placeholder";
  const msg = ctx.doc.createElement("p");
  msg.className = "onboarding-placeholder-copy";
  msg.textContent = `Screen ${ctx.getSnapshot().state} lands in a later plan.`;
  container.appendChild(msg);
  ctx.root.appendChild(container);
  return {
    unmount: () => {
      container.remove();
    },
  };
};

const resolveScreenHost = (doc: Document): {
  host: HTMLElement;
  hideVaultMainWrap: () => void;
  restoreVaultMainWrap: () => void;
} => {
  const configured = doc.getElementById(ONBOARDING_ROOT_ID);
  if (configured instanceof HTMLElement) {
    const wasHidden = configured.hidden;
    const mainVaultWrap = doc.querySelector<HTMLElement>("main.vault-wrap");
    const mainVaultWrapWasHidden = mainVaultWrap?.hidden ?? true;
    return {
      host: configured,
      hideVaultMainWrap: () => {
        configured.hidden = false;
        if (mainVaultWrap) mainVaultWrap.hidden = true;
      },
      restoreVaultMainWrap: () => {
        configured.hidden = wasHidden;
        if (mainVaultWrap) mainVaultWrap.hidden = mainVaultWrapWasHidden;
      },
    };
  }
  const fallback = doc.body;
  return {
    host: fallback,
    hideVaultMainWrap: () => undefined,
    restoreVaultMainWrap: () => undefined,
  };
};

const renderActiveScreen = (
  controller: OnboardingController,
  screenHost: HTMLElement,
  doc: Document,
  currentHandle: ScreenHandle | null,
  keyEntryOriginRef: { value: "KEY_FROM_OTHER_DEVICE" | "KEY_FROM_AUTH_APP" | null },
  qaVariant?: string
): ScreenHandle => {
  currentHandle?.unmount();
  const snapshot = controller.getSnapshot();
  const mount = SCREEN_MOUNTS[snapshot.state] ?? mountPlaceholderScreen;
  const ctx: OnboardingScreenContext = {
    doc,
    root: screenHost,
    qaVariant,
    getSnapshot: controller.getSnapshot,
    setEmail: controller.setEmail,
    setPassword: controller.setPassword,
    setCredentialError: controller.setCredentialError,
    dispatch: (event) => {
      if (
        event === "RETRY_KEY" &&
        controller.getSnapshot().state === "TEST_LOGIN_BAD_KEY"
      ) {
        controller.setState(keyEntryOriginRef.value ?? "KEY_FROM_OTHER_DEVICE");
        return;
      }
      controller.dispatch(event);
    },
  };
  return mount(ctx);
};

// Lookup table for the fast-forward-to-verify-login loop. Each entry maps
// the current state to the single event that advances it one step closer to
// VERIFY_LOGIN_CODE. States not in this table are terminal for the loop.
const FAST_FORWARD_EVENTS: Partial<Record<OnboardingState, OnboardingEvent>> = {
  CUNY_TOTP: "TOTP_DONE",
  ALLOW_GATE: "ALLOW_CLICKED",
  OAA_SPA_HOME: "FACTORS_LIST_READY",
  GUIDED_MANAGE: "GUIDED_STEP_DONE",
  GUIDED_ADD_FACTOR: "GUIDED_STEP_DONE",
  GUIDED_FACTOR_TYPE: "GUIDED_STEP_DONE",
  GUIDED_SECRET_CAPTURE: "SECRET_CAPTURED",
};

/** Hard ceiling on fast-forward iterations — larger than the longest FAST_FORWARD_EVENTS chain, but bounded so a transition bug can't spin forever. */
const MAX_FAST_FORWARD_STEPS = 10;

const fastForwardToVerifyLogin = (controller: OnboardingController): void => {
  let step = 0;
  while (
    controller.getSnapshot().state !== "VERIFY_LOGIN_CODE" &&
    step < MAX_FAST_FORWARD_STEPS
  ) {
    step += 1;
    const event = FAST_FORWARD_EVENTS[controller.getSnapshot().state];
    if (!event) break;
    controller.dispatch(event);
  }
};

const fastForwardToSetDefault = (controller: OnboardingController): void => {
  fastForwardToVerifyLogin(controller);
  if (controller.getSnapshot().state === "VERIFY_LOGIN_CODE") {
    controller.dispatch("VERIFY_SUCCEEDED");
  }
};

const dispatchIfState = (
  controller: OnboardingController,
  state: OnboardingState,
  event: OnboardingEvent
): void => {
  if (controller.getSnapshot().state === state) {
    controller.dispatch(event);
  }
};

const dispatchSequence = (
  controller: OnboardingController,
  events: readonly OnboardingEvent[]
): void => {
  for (const event of events) controller.dispatch(event);
};

const handleCunyTotpChallenge = (controller: OnboardingController): void => {
  controller.dispatch("CREDENTIALS_ACCEPTED");
};

const handleAllowGate = (controller: OnboardingController): void => {
  // mfaConsent.jsp loaded. Advance from OPENING_CUNY (CUNY skipped TOTP) or
  // CUNY_TOTP (normal flow where TOTP was shown first).
  //
  // NOTE: TEST_LOGIN is deliberately NOT advanced here. The allow gate is a
  // mid-flow OAuth consent page, not proof of a successful Brightspace login —
  // the user still has to click Allow and the SAML assertion must complete
  // before the session is established. TEST_LOGIN success is signalled solely
  // by the real Brightspace session cookie (wireBrightspaceCookieDetection).
  // Treating the allow gate as success here jumped the student to
  // EXT_PASSWORD_SETUP before the login actually finished.
  if (controller.getSnapshot().state === "OPENING_CUNY") {
    controller.dispatch("CREDENTIALS_ACCEPTED");
  }
  dispatchIfState(controller, "CUNY_TOTP", "TOTP_DONE");
};

const handleAllowButtonClicked = (controller: OnboardingController): void => {
  dispatchIfState(controller, "ALLOW_GATE", "ALLOW_CLICKED");
};

const handleOaaSpaHome = (controller: OnboardingController): void => {
  if (controller.getSnapshot().state === "CUNY_TOTP") {
    controller.dispatch("TOTP_DONE");
  }
  dispatchIfState(controller, "ALLOW_GATE", "ALLOW_CLICKED");
};

const handleAddFactor = (controller: OnboardingController): void => {
  const state = controller.getSnapshot().state;
  if (state === "GUIDED_MANAGE") {
    controller.dispatch("GUIDED_STEP_DONE");
    dispatchIfState(controller, "GUIDED_ADD_FACTOR", "GUIDED_STEP_DONE");
    return;
  }
  if (state === "GUIDED_ADD_FACTOR") {
    controller.dispatch("GUIDED_STEP_DONE");
  }
};

const handleFactorTypeSelect = (controller: OnboardingController): void => {
  dispatchIfState(controller, "GUIDED_ADD_FACTOR", "GUIDED_STEP_DONE");
};

const handleFactorsList = (controller: OnboardingController): void => {
  const state = controller.getSnapshot().state;
  if (state === "CUNY_TOTP") {
    dispatchSequence(controller, ["TOTP_DONE", "ALLOW_CLICKED", "FACTORS_LIST_READY", "GUIDED_STEP_DONE"]);
    return;
  }
  if (state === "ALLOW_GATE") {
    dispatchSequence(controller, ["ALLOW_CLICKED", "FACTORS_LIST_READY", "GUIDED_STEP_DONE"]);
    return;
  }
  if (state === "OAA_SPA_HOME") {
    controller.dispatch("FACTORS_LIST_READY");
  }
};

const handleTotpEnrollSecret = (controller: OnboardingController): void => {
  let state = controller.getSnapshot().state;
  if (state === "CUNY_TOTP") {
    dispatchSequence(controller, [
      "TOTP_DONE",
      "ALLOW_CLICKED",
      "FACTORS_LIST_READY",
      "GUIDED_STEP_DONE",
      "GUIDED_STEP_DONE",
      "GUIDED_STEP_DONE",
    ]);
    return;
  }
  if (state === "ALLOW_GATE") {
    dispatchSequence(controller, [
      "ALLOW_CLICKED",
      "FACTORS_LIST_READY",
      "GUIDED_STEP_DONE",
      "GUIDED_STEP_DONE",
      "GUIDED_STEP_DONE",
    ]);
    return;
  }
  if (state === "GUIDED_ADD_FACTOR") {
    controller.dispatch("GUIDED_STEP_DONE");
    state = controller.getSnapshot().state;
  }
  if (state === "GUIDED_FACTOR_TYPE") {
    controller.dispatch("GUIDED_STEP_DONE");
  }
};

const handleTotpEnrollVerify = (controller: OnboardingController): void => {
  const state = controller.getSnapshot().state;
  if (state === "GUIDED_SECRET_CAPTURE") {
    controller.dispatch("SECRET_CAPTURED");
    return;
  }
  if (state === "CUNY_TOTP" || state === "ALLOW_GATE" || state === "OAA_SPA_HOME") {
    fastForwardToVerifyLogin(controller);
  }
};

const NO_SECRET_RECOVERY_TEXT =
  "We found an existing authentication factor but don't have its secret key. " +
  "Please delete it from the CUNY tab and re-enroll.";

const handleFactorsListAfterEnroll = (controller: OnboardingController): void => {
  // Check in the sidebar (where storage.session is reliably available) rather
  // than the content script, which may lack session-storage access.
  void (async () => {
    let hasSecret = true; // safe default if storage is unavailable
    try {
      const got = await browser.storage.session?.get(PENDING_TOTP_SECRET_SESSION_KEY);
      const val = got?.[PENDING_TOTP_SECRET_SESSION_KEY];
      hasSecret = typeof val === "string" && val.length > 0;
    } catch {
      /* storage.session threw — keep hasSecret = true to avoid blocking the flow */
    }

    if (!hasSecret) return;

    const state = controller.getSnapshot().state;
    if (state === "VERIFY_LOGIN_CODE") {
      controller.dispatch("VERIFY_SUCCEEDED");
      return;
    }
    if (
      state === "CUNY_TOTP" ||
      state === "ALLOW_GATE" ||
      state === "OAA_SPA_HOME" ||
      state === "GUIDED_MANAGE" ||
      state === "GUIDED_ADD_FACTOR" ||
      state === "GUIDED_FACTOR_TYPE" ||
      state === "GUIDED_SECRET_CAPTURE"
    ) {
      fastForwardToSetDefault(controller);
    }
  })();
};

const handleSetDefaultMenuOpened = (controller: OnboardingController): void => {
  if (controller.getSnapshot().state === "SET_DEFAULT") {
    showSetDefaultOptionOverlay();
  }
};

const handleSetDefaultConfirmed = (controller: OnboardingController): void => {
  dispatchIfState(controller, "SET_DEFAULT", "SET_DEFAULT_COMPLETED");
};

const noopHandler = (_controller: OnboardingController): void => undefined;

/**
 * Applies an onboarding wire message to the controller. Exported for unit
 * tests so we can exercise the routing logic without standing up a full
 * runtime.onMessage stub.
 */
export const applyOnboardingMessage = (
  controller: OnboardingController,
  message: OnboardingMessage
): void => {
  if (message.type === "ONBOARDING_CREDENTIAL_ERROR") {
    if (controller.getSnapshot().state === "TEST_LOGIN") {
      controller.dispatch("TEST_BAD_CREDENTIALS");
      return;
    }
    controller.setCredentialError({ culprit: message.culprit });
    if (message.culprit === "email") {
      controller.dispatch("CREDENTIAL_ERROR_ROUTE_TO_EMAIL");
    } else {
      controller.dispatch("CREDENTIAL_ERROR_DETECTED");
    }
    return;
  }
  if (message.type === "ONBOARDING_STAGE_DETECTED") {
    const stageDetectedHandlers = Object.freeze({
      cuny_totp_challenge: handleCunyTotpChallenge,
      allow_gate: handleAllowGate,
      allow_button_clicked: handleAllowButtonClicked,
      oaa_spa_home: handleOaaSpaHome,
      factors_list: handleFactorsList,
      add_factor: handleAddFactor,
      factor_type_select: handleFactorTypeSelect,
      totp_enroll_secret: handleTotpEnrollSecret,
      totp_enroll_verify: handleTotpEnrollVerify,
      factors_list_after_enroll: handleFactorsListAfterEnroll,
      set_default_menu_opened: handleSetDefaultMenuOpened,
      set_default_confirmed: handleSetDefaultConfirmed,
      unverified_cunyautologin: noopHandler,
      totp_factor_limit: noopHandler,
      access_denied: noopHandler,
      target_not_found: noopHandler,
    } satisfies Record<OnboardingPageStage, (c: OnboardingController) => void>);
    stageDetectedHandlers[message.stage](controller);
    return;
  }
  // ONBOARDING_OVERLAY_COMMAND / VERIFY_STATUS / REOPEN_CUNY_TAB are handled
  // elsewhere; nothing to do here.
};

const showFirstVisible = (
  screenHost: HTMLElement,
  selector: string
): void => {
  const el = screenHost.querySelector<HTMLElement>(selector);
  if (el) el.hidden = false;
};

const handleVerifyStatusMessage = (
  controller: OnboardingController,
  screenHost: HTMLElement,
  status: unknown
): void => {
  if (status === "success") {
    dispatchIfState(controller, "VERIFY_LOGIN_CODE", "VERIFY_SUCCEEDED");
  } else if (status === "second_failure") {
    showFirstVisible(screenHost, "[data-onboarding-verify-pause='true']");
    dispatchIfState(controller, "TEST_LOGIN", "TEST_BAD_KEY");
  }
  // "pending" / "first_failure" need no sidebar action — the OTP-field overlay from
  // mountVerifyLoginCodeScreen stays anchored and the user clicks
  // "Verify and Save" themselves. The success transition is driven by
  // the factors_list_after_enroll stage, not by this message.
};

/** Synthetic "signed in" progress signal — the content script never sends this;
 *  the sidebar derives it from Brightspace cookie detection (see below). */
const SIGNED_IN_PROGRESS: OnboardingLoginProgress = {
  type: "ONBOARDING_LOGIN_PROGRESS",
  step: "signed_in",
};

const installRuntimeMessageBridge = (
  controller: OnboardingController,
  screenHost: HTMLElement,
  getActiveScreenHandle: () => ScreenHandle | null,
  onCunyTabSeen?: (tabId: number) => void
): (() => void) => {
  const stageSideEffects = {
    target_not_found: () =>
      showFirstVisible(screenHost, "[data-onboarding-recovery-message='true']"),
    access_denied: () =>
      showFirstVisible(screenHost, "[data-onboarding-recovery-message='true']"),
    totp_factor_limit: () =>
      showFirstVisible(screenHost, "[data-onboarding-five-factor-limit='true']"),
    unverified_cunyautologin: () =>
      showFirstVisible(screenHost, "[data-onboarding-verify-later-recovery='true']"),
  } as const;
  const listener = (
    message: unknown,
    sender: Runtime.MessageSender
  ): void => {
    if (sender.id !== browser.runtime.id) return;
    if (!onboardingRuntimeBridgeSenderTrusted(sender)) return;
    if (!isOnboardingMessage(message)) return;
    if (isDevMode()) {
      // eslint-disable-next-line no-console
      console.log(`[onboarding/render] runtime message: ${message.type}`);
    }
    const senderTabId = sender?.tab?.id;
    if (typeof senderTabId === "number") {
      onCunyTabSeen?.(senderTabId);
    }
    applyOnboardingMessage(controller, message);
    routeByType(message, {
      ONBOARDING_STAGE_DETECTED: (typedMessage) => {
        const stage = typedMessage.stage;
        const sideEffect = stageSideEffects[stage as keyof typeof stageSideEffects];
        sideEffect?.();
        if (stage === "factors_list_after_enroll") {
          // DOM side-effect: show no-secret recovery using screenHost (avoids
          // direct document.querySelector in the handler). Dispatch is handled
          // separately by applyOnboardingMessage above.
          void (async () => {
            try {
              const got = await browser.storage.session?.get(PENDING_TOTP_SECRET_SESSION_KEY);
              const val = got?.[PENDING_TOTP_SECRET_SESSION_KEY];
              if (!(typeof val === "string" && val.length > 0)) {
                const el = screenHost.querySelector<HTMLElement>(
                  "[data-onboarding-recovery-message='true']"
                );
                if (el) {
                  el.textContent = NO_SECRET_RECOVERY_TEXT;
                  el.hidden = false;
                }
              }
            } catch {
              /* storage.session unavailable — nothing to show */
            }
          })();
        }
      },
      ONBOARDING_VERIFY_STATUS: (typedMessage) => {
        handleVerifyStatusMessage(controller, screenHost, typedMessage.status);
      },
    });
    // Forward every validated message to the active screen so live-updating
    // screens (the login checklist) can react without a re-render. Our
    // checklist messages don't trigger a state transition, so the handle is
    // still the one that was active when the message arrived.
    getActiveScreenHandle()?.onMessage?.(message);
  };
  try {
    browser.runtime.onMessage.addListener(listener);
  } catch (error) {
    // Non-extension context (jsdom without mock) — bridge is a no-op.
    reportOnboardingFailure("runtime.onMessage.addListener", error);
    return () => undefined;
  }
  return () => {
    try {
      browser.runtime.onMessage.removeListener(listener);
    } catch (error) {
      // Ignore; listener registration may have failed silently.
      reportOnboardingFailure("runtime.onMessage.removeListener", error);
    }
  };
};

/** Best-effort retries — transient SW wake failures should not leave staging live.
 *  0ms: immediate; 75ms: covers SW message-queue drain; 200ms: covers cold SW wake (~100–150ms on slow devices). */
const CLEAR_STAGING_RETRY_BACKOFF_MS = [0, 75, 200] as const;

const clearStagedOnboardingCredentials = (): void => {
  const message: ClearOnboardingCredentials = {
    type: "CLEAR_ONBOARDING_CREDENTIALS",
  };
  void (async () => {
    let lastError: unknown;
    for (const delayMs of CLEAR_STAGING_RETRY_BACKOFF_MS) {
      if (delayMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
      try {
        await browser.runtime.sendMessage(message);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    reportOnboardingFailure("runtime.sendMessage(CLEAR_ONBOARDING_CREDENTIALS)", lastError);
  })();
};

const mountDevQaBanner = (
  doc: Document,
  state: OnboardingState
): HTMLElement => {
  const aside = doc.createElement("aside");
  aside.className = "onboarding-dev-qa-strip";
  aside.dataset.devQaJumpBanner = "true";
  aside.setAttribute("aria-label", "Development visual QA");
  aside.textContent = `Dev QA jump: ${state}`;
  return aside;
};

// Skeleton shell + refs split out so `mountOnboarding` stays under eslint max-lines.
const buildOnboardingShell = (
  doc: Document,
  host: HTMLElement
): {
  shell: HTMLElement;
  screenHost: HTMLElement;
  resumeButton: HTMLButtonElement;
  reopenCunyButton: HTMLButtonElement;
} => {
  const shell = doc.createElement("div");
  shell.dataset.onboardingShell = "true";
  shell.className = "onboarding-shell";
  host.appendChild(shell);

  const screenHost = doc.createElement("div");
  screenHost.dataset.onboardingScreenHost = "true";
  screenHost.className = "onboarding-screen-host";
  shell.appendChild(screenHost);

  const interruptionActions = doc.createElement("div");
  interruptionActions.className = "onboarding-actions onboarding-actions-single";
  shell.appendChild(interruptionActions);

  const resumeButton = doc.createElement("button");
  resumeButton.type = "button";
  resumeButton.dataset.onboardingResume = "true";
  resumeButton.className = "onboarding-forward primary";
  resumeButton.textContent = "Welcome back - resume where you left off";
  resumeButton.hidden = true;
  interruptionActions.appendChild(resumeButton);

  const reopenCunyButton = doc.createElement("button");
  reopenCunyButton.type = "button";
  reopenCunyButton.dataset.onboardingReopenCuny = "true";
  reopenCunyButton.className = "onboarding-forward primary";
  reopenCunyButton.textContent = "Reopen CUNY tab";
  reopenCunyButton.hidden = true;
  interruptionActions.appendChild(reopenCunyButton);

  return { shell, screenHost, resumeButton, reopenCunyButton };
};

// When the active CUNY tab closes, clear the handle and surface the interruption UI.
const wireTabCloseDetection = (
  activeCunyTabIdRef: { value: number | null },
  onTabClosed: () => void
): (() => void) => {
  const tabsOnRemoved = (browser.tabs as unknown as {
    onRemoved?: {
      addListener?: (listener: (tabId: number, removeInfo: unknown) => void) => void;
      removeListener?: (listener: (tabId: number, removeInfo: unknown) => void) => void;
    };
  }).onRemoved;
  const onTabRemoved = (tabId: number): void => {
    if (activeCunyTabIdRef.value === null) return;
    if (tabId !== activeCunyTabIdRef.value) return;
    activeCunyTabIdRef.value = null;
    onTabClosed();
  };
  try {
    tabsOnRemoved?.addListener?.(onTabRemoved);
  } catch (error) {
    // Ignore when tabs API is unavailable.
    reportOnboardingFailure("tabs.onRemoved.addListener", error);
  }
  return () => {
    try {
      tabsOnRemoved?.removeListener?.(onTabRemoved);
    } catch (error) {
      // Ignore remove failures in non-extension contexts.
      reportOnboardingFailure("tabs.onRemoved.removeListener", error);
    }
  };
};

// When the Brightspace IdP sets a session cookie the SAML login succeeded.
// Uses cookies.onChanged so success is detected even when the SSO server-side
// session was still alive and the credential page was bypassed (no content-script
// message → activeCunyTabIdRef stays null → tabs.onUpdated guard would never fire).
const wireBrightspaceCookieDetection = (
  controller: OnboardingController,
  getActiveScreenHandle: () => ScreenHandle | null,
): () => void => {
  const cookiesOnChanged = (browser.cookies as unknown as {
    onChanged?: {
      addListener?: (listener: (changeInfo: { removed: boolean; cookie: { name: string; domain: string } }) => void) => void;
      removeListener?: (listener: (changeInfo: { removed: boolean; cookie: { name: string; domain: string } }) => void) => void;
    };
  }).onChanged;
  const onCookieChanged = (changeInfo: { removed: boolean; cookie: { name: string; domain: string } }): void => {
    if (changeInfo.removed) return;
    if (!(BRIGHTSPACE_SESSION_COOKIE_NAMES as readonly string[]).includes(changeInfo.cookie.name)) return;
    if (!isBrightspaceCookieDomain(changeInfo.cookie.domain)) return;
    // Real "signed in" — complete the active login checklist (TEST_LOGIN or the
    // guided COMPLETE_DEMO) before TEST_LOGIN navigates onward. Other screens
    // ignore the hook.
    getActiveScreenHandle()?.onMessage?.(SIGNED_IN_PROGRESS);
    dispatchIfState(controller, "TEST_LOGIN", "TEST_SUCCEEDED");
  };
  try {
    cookiesOnChanged?.addListener?.(onCookieChanged);
  } catch (error) {
    reportOnboardingFailure("cookies.onChanged.addListener", error);
  }
  return () => {
    try {
      cookiesOnChanged?.removeListener?.(onCookieChanged);
    } catch (error) {
      reportOnboardingFailure("cookies.onChanged.removeListener", error);
    }
  };
};

// Session snapshot lets the student resume without re-entering email/password after a reload.
const loadAndApplyResumeSnapshot = async (
  setPendingResumeSnapshot: (snapshot: PendingResumeSnapshot) => void,
  repaintInterruptionActions: () => void
): Promise<void> => {
  const snapshot = await loadResumeSnapshotFromSession();
  if (!snapshot) return;
  setPendingResumeSnapshot({
    state: snapshot.state,
    email: snapshot.email ?? "",
    password: snapshot.password ?? "",
    advancedKeyFlow: snapshot.advancedKeyFlow ?? false,
  });
  repaintInterruptionActions();
};

const CUNY_REATTACHABLE_STATES: ReadonlySet<OnboardingState> = new Set([
  "OPENING_CUNY",
  "TEST_LOGIN",
  "ALLOW_GATE",
  "OAA_SPA_HOME",
  "GUIDED_MANAGE",
  "GUIDED_ADD_FACTOR",
  "GUIDED_FACTOR_TYPE",
  "GUIDED_SECRET_CAPTURE",
  "VERIFY_LOGIN_CODE",
  "SET_DEFAULT",
]);

type OnboardingMountModel = {
  readonly controller: OnboardingController;
  readonly doc: Document;
  readonly screenHost: HTMLElement;
  readonly resumeButton: HTMLButtonElement;
  readonly reopenCunyButton: HTMLButtonElement;
  readonly shell: HTMLElement;
  readonly header: ReturnType<typeof mountBeadHeader>;
  readonly restoreVaultMainWrap: () => void;
  readonly suppressResumeSnapshots: boolean;
  /** Dev/QA visual variant from the deep link, forwarded to the active screen. */
  readonly qaVariant?: string;
};

type OnboardingUnmountBag = {
  readonly unsubscribe: () => void;
  readonly uninstallBridge: () => void;
  readonly unwireTabClose: () => void;
  readonly unwireBrightspaceCookie: () => void;
  readonly resumeButton: HTMLButtonElement;
  readonly reopenCunyButton: HTMLButtonElement;
  readonly handleResume: () => void;
  readonly handleReopenCuny: () => void;
  readonly controller: OnboardingController;
  readonly screenHandleRef: { current: ScreenHandle | null };
  readonly header: ReturnType<typeof mountBeadHeader>;
  readonly shell: HTMLElement;
  readonly restoreVaultMainWrap: () => void;
  readonly suppressResumeSnapshots: boolean;
};

const runOnboardingUnmount = (bag: OnboardingUnmountBag): void => {
  bag.unsubscribe();
  bag.uninstallBridge();
  bag.unwireTabClose();
  bag.unwireBrightspaceCookie();
  bag.resumeButton.removeEventListener("click", bag.handleResume);
  bag.reopenCunyButton.removeEventListener("click", bag.handleReopenCuny);
  if (!bag.suppressResumeSnapshots) {
    const snap = bag.controller.getSnapshot();
    const message: PersistOnboardingResumeSnapshot = {
      type: "PERSIST_ONBOARDING_RESUME_SNAPSHOT",
      state: snap.state,
      email: snap.email,
      password: snap.password,
      advancedKeyFlow: snap.advancedKeyFlow,
    };
    void browser.runtime
      .sendMessage(message)
      .catch(() => persistOnboardingResumeSnapshot(snap));
  }
  clearStagedOnboardingCredentials();
  bag.screenHandleRef.current?.unmount();
  bag.header.unmount();
  bag.shell.remove();
  bag.restoreVaultMainWrap();
};

const subscribeOnboardingController = (
  controller: OnboardingController,
  repaint: () => void,
  suppressResumeSnapshots: boolean,
  keyEntryOriginRef: { value: "KEY_FROM_OTHER_DEVICE" | "KEY_FROM_AUTH_APP" | null }
): (() => void) => {
  let lastState: OnboardingState = controller.getSnapshot().state;
  let resumeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const clearResumeDebounceTimer = (): void => {
    if (resumeDebounceTimer !== null) {
      clearTimeout(resumeDebounceTimer);
      resumeDebounceTimer = null;
    }
  };
  const innerUnsubscribe = controller.subscribe((snapshot) => {
    if (snapshot.state === "KEY_FROM_OTHER_DEVICE" || snapshot.state === "KEY_FROM_AUTH_APP") {
      keyEntryOriginRef.value = snapshot.state;
    }
    if (!suppressResumeSnapshots) {
      clearResumeDebounceTimer();
      if (snapshot.state !== lastState) {
        void persistOnboardingResumeSnapshot(snapshot);
      }
      resumeDebounceTimer = setTimeout(() => {
        resumeDebounceTimer = null;
        void persistOnboardingResumeSnapshot(controller.getSnapshot());
      }, RESUME_SNAPSHOT_DEBOUNCE_MS);
    }
    if (snapshot.state === lastState) return;
    lastState = snapshot.state;
    repaint();
  });
  return () => {
    clearResumeDebounceTimer();
    innerUnsubscribe();
  };
};

type SidebarResumeLatch = { snapshot: PendingResumeSnapshot | null };

const registerSidebarInterruptionBindings = ({
  latch,
  controller,
  resumeButton,
  reopenCunyButton,
  repaint,
  repaintInterruptionActions,
  activeCunyTabIdRef,
  isCunyTabMissingFlag,
}: {
  latch: SidebarResumeLatch;
  controller: OnboardingController;
  resumeButton: HTMLButtonElement;
  reopenCunyButton: HTMLButtonElement;
  repaint: () => void;
  repaintInterruptionActions: () => void;
  activeCunyTabIdRef: { value: number | null };
  isCunyTabMissingFlag: { value: boolean };
}): {
  readonly handleResume: () => void;
  readonly handleReopenCuny: () => void;
  readonly unwireTabClose: () => void;
} => {
  const handleResume = (): void => {
    if (!latch.snapshot) return;
    controller.setEmail(latch.snapshot.email);
    controller.setPassword(latch.snapshot.password);
    controller.setAdvancedKeyFlow(latch.snapshot.advancedKeyFlow);
    controller.setState(latch.snapshot.state);
    latch.snapshot = null;
    repaint();
  };
  resumeButton.addEventListener("click", handleResume);

  const handleReopenCuny = (): void => {
    const message: OnboardingMessage = { type: "ONBOARDING_REOPEN_CUNY_TAB" };
    isCunyTabMissingFlag.value = false;
    repaintInterruptionActions();
    void browser.runtime.sendMessage(message).catch(() => undefined);
  };
  reopenCunyButton.addEventListener("click", handleReopenCuny);

  const unwireTabClose = wireTabCloseDetection(activeCunyTabIdRef, () => {
    isCunyTabMissingFlag.value = true;
    repaintInterruptionActions();
  });

  return { handleResume, handleReopenCuny, unwireTabClose };
};

type LifecycleRefs = {
  screenHandleRef: { current: ScreenHandle | null };
  resumeLatch: SidebarResumeLatch;
  isCunyTabMissingFlag: { value: boolean };
};

const buildRepaintCallbacks = (
  model: OnboardingMountModel,
  refs: LifecycleRefs,
  keyEntryOriginRef: { value: "KEY_FROM_OTHER_DEVICE" | "KEY_FROM_AUTH_APP" | null }
): { repaint: () => void; repaintInterruptionActions: () => void } => {
  const { controller, resumeButton, reopenCunyButton, header, screenHost, doc } = model;
  const repaintInterruptionActions = (): void => {
    resumeButton.hidden = refs.resumeLatch.snapshot === null;
    reopenCunyButton.hidden =
      !CUNY_REATTACHABLE_STATES.has(controller.getSnapshot().state) ||
      !refs.isCunyTabMissingFlag.value;
  };
  const repaint = (): void => {
    header.renderFor(controller.getSnapshot().state);
    refs.screenHandleRef.current = renderActiveScreen(
      controller, screenHost, doc, refs.screenHandleRef.current, keyEntryOriginRef, model.qaVariant
    );
    repaintInterruptionActions();
  };
  return { repaint, repaintInterruptionActions };
};

const bindOnboardingLifecycle = (model: OnboardingMountModel): (() => void) => {
  const { controller, screenHost, resumeButton, reopenCunyButton, shell, header,
    restoreVaultMainWrap, suppressResumeSnapshots } = model;
  const keyEntryOriginRef: { value: "KEY_FROM_OTHER_DEVICE" | "KEY_FROM_AUTH_APP" | null } = { value: null };
  const refs: LifecycleRefs = {
    screenHandleRef: { current: null },
    resumeLatch: { snapshot: null },
    isCunyTabMissingFlag: { value: false },
  };
  const activeCunyTabIdRef = { value: null as number | null };

  const { repaint, repaintInterruptionActions } = buildRepaintCallbacks(model, refs, keyEntryOriginRef);

  const getActiveScreenHandle = (): ScreenHandle | null => refs.screenHandleRef.current;
  const unsubscribe = subscribeOnboardingController(controller, repaint, suppressResumeSnapshots, keyEntryOriginRef);
  const uninstallBridge = installRuntimeMessageBridge(controller, screenHost, getActiveScreenHandle, (tabId) => {
    activeCunyTabIdRef.value = tabId;
    refs.isCunyTabMissingFlag.value = false;
    repaintInterruptionActions();
  });
  const { handleResume, handleReopenCuny, unwireTabClose } =
    registerSidebarInterruptionBindings({
      latch: refs.resumeLatch,
      controller,
      resumeButton,
      reopenCunyButton,
      repaint,
      repaintInterruptionActions,
      activeCunyTabIdRef,
      isCunyTabMissingFlag: refs.isCunyTabMissingFlag,
    });
  const unwireBrightspaceCookie = wireBrightspaceCookieDetection(controller, getActiveScreenHandle);

  repaint();
  if (!suppressResumeSnapshots) {
    void loadAndApplyResumeSnapshot(
      (snapshot) => { refs.resumeLatch.snapshot = snapshot; },
      repaintInterruptionActions
    );
  }

  const bag: OnboardingUnmountBag = {
    unsubscribe, uninstallBridge, unwireTabClose, unwireBrightspaceCookie,
    resumeButton, reopenCunyButton,
    handleResume, handleReopenCuny, controller,
    screenHandleRef: refs.screenHandleRef, header, shell, restoreVaultMainWrap,
    suppressResumeSnapshots,
  };
  return () => runOnboardingUnmount(bag);
};

export const mountOnboarding = (
  doc: Document,
  options?: MountOnboardingOptions
): (() => void) => {
  const qaJumpBundle = options?.qaJump;
  const qaJumpActive = qaJumpBundle !== undefined;
  const { host, hideVaultMainWrap, restoreVaultMainWrap } = resolveScreenHost(doc);
  hideVaultMainWrap();
  const { shell, screenHost, resumeButton, reopenCunyButton } = buildOnboardingShell(doc, host);

  if (qaJumpActive) {
    const jumpState = qaJumpBundle.controllerInit.initialState ?? "WELCOME";
    shell.prepend(mountDevQaBanner(doc, jumpState));
  }

  const header = mountBeadHeader(doc, shell);
  const controller = createOnboardingController(qaJumpBundle?.controllerInit ?? {});
  return bindOnboardingLifecycle({
    controller,
    doc,
    screenHost,
    resumeButton,
    reopenCunyButton,
    shell,
    header,
    restoreVaultMainWrap,
    suppressResumeSnapshots: qaJumpActive,
    qaVariant: qaJumpBundle?.qaVariant,
  });
};
