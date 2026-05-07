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
 * Security: this module holds the email/password drafts only via the
 * controller closure. Nothing written to `browser.storage.*`. The sidebar
 * unmount path fires `CLEAR_ONBOARDING_CREDENTIALS` so the service worker
 * also drops its in-memory copy.
 */

import browser from "webextension-polyfill";
import { mountBeadHeader } from "./beadHeader";
import {
  type OnboardingController,
  createOnboardingController,
} from "./controller";
import {
  type ClearOnboardingCredentials,
  type OnboardingMessage,
  type OnboardingPageStage,
  isOnboardingMessage,
} from "./messages";
import { PENDING_TOTP_SECRET_SESSION_KEY } from "../cuny/ssoSite";
import { SCREEN_MOUNTS } from "./screenMounts";
import { showSetDefaultOptionOverlay } from "./screens/setDefault";
import type {
  OnboardingScreenContext,
  ScreenHandle,
} from "./screens/screenContext";
import type { DevQaJumpParseResult } from "./devQaJump";
import {
  clearResumeSnapshotSession,
  loadResumeSnapshotFromSession,
  saveResumeSnapshotSession,
} from "./resumeSession";
import {
  type BeadStage,
  type OnboardingState,
  safeResumeStateFor,
} from "./state";
import { type OnboardingEvent } from "./transitions";
import { routeByType } from "../runtime/messageRouter";

export { beadViewModelForState, type BeadViewModel } from "./beadViewModel";

/** Dev QA deep link options — pass `qaJump` from `tryParseDevQaOnboardingJumpFromWindow`. */
export type MountOnboardingOptions = {
  readonly qaJump?: DevQaJumpParseResult;
};

export type ScreenRenderer = {
  readonly state: OnboardingState;
  mount: (ctx: OnboardingRenderContext) => void;
  unmount?: () => void;
};

export type OnboardingRenderContext = {
  readonly root: HTMLElement;
  readonly currentState: OnboardingState;
  readonly bead: BeadStage;
  readonly dispatch: (event: OnboardingEvent) => void;
};

export const ONBOARDING_ROOT_ID = "onboarding-root";
export const ONBOARDING_SCREEN_HOST_SELECTOR =
  "[data-onboarding-screen-host='true']";
export const ONBOARDING_PLACEHOLDER_SELECTOR =
  "[data-onboarding-placeholder='true']";
export const ONBOARDING_RESUME_BUTTON_SELECTOR = "[data-onboarding-resume='true']";
export const ONBOARDING_REOPEN_CUNY_SELECTOR = "[data-onboarding-reopen-cuny='true']";

const DEV_MODE_NAMES = ["development", "e2e"] as const;

type PendingResumeSnapshot = {
  readonly state: OnboardingState;
  readonly email: string;
  readonly password: string;
};

const isDevMode = (): boolean =>
  (DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE);

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
  currentHandle: ScreenHandle | null
): ScreenHandle => {
  currentHandle?.unmount();
  const snapshot = controller.getSnapshot();
  const mount = SCREEN_MOUNTS[snapshot.state] ?? mountPlaceholderScreen;
  const ctx: OnboardingScreenContext = {
    doc,
    root: screenHost,
    getSnapshot: controller.getSnapshot,
    setEmail: controller.setEmail,
    setPassword: controller.setPassword,
    setCredentialError: controller.setCredentialError,
    dispatch: controller.dispatch,
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

const fastForwardToVerifyLogin = (controller: OnboardingController): void => {
  let guard = 0;
  while (controller.getSnapshot().state !== "VERIFY_LOGIN_CODE" && guard < 10) {
    guard += 1;
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

    if (!hasSecret) {
      const recoveryEl = document.querySelector<HTMLElement>(
        "[data-onboarding-recovery-message='true']"
      );
      if (recoveryEl) {
        recoveryEl.textContent =
          "We found an existing authentication factor but don't have its secret key. " +
          "Please delete it from the CUNY tab and re-enroll.";
        recoveryEl.hidden = false;
      }
      return;
    }

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
    controller.setCredentialError({ culprit: message.culprit });
    controller.dispatch("CREDENTIAL_ERROR_DETECTED");
    if (message.culprit === "email") {
      controller.dispatch("CREDENTIAL_ERROR_ROUTE_TO_EMAIL");
    } else {
      controller.dispatch("NEXT");
    }
    return;
  }
  if (message.type === "ONBOARDING_STAGE_DETECTED") {
    const stageDetectedHandlers = Object.freeze({
      credential_page: noopHandler,
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
  // ONBOARDING_OVERLAY_COMMAND / VERIFY_STATUS / REOPEN_CUNY_TAB /
  // TAB_REATTACHED are handled elsewhere; nothing to do here.
};

const showFirstVisible = (
  screenHost: HTMLElement,
  selector: string
): void => {
  const el = screenHost.querySelector<HTMLElement>(selector);
  if (el) el.hidden = false;
};

const installRuntimeMessageBridge = (
  controller: OnboardingController,
  screenHost: HTMLElement,
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
    sender?: { tab?: { id?: number } | undefined }
  ): void => {
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
      },
      ONBOARDING_VERIFY_STATUS: (typedMessage) => {
        if (typedMessage.status === "success") {
          const state = controller.getSnapshot().state;
          if (state === "VERIFY_LOGIN_CODE") {
            controller.dispatch("VERIFY_SUCCEEDED");
          }
        } else if (typedMessage.status === "second_failure") {
          showFirstVisible(screenHost, "[data-onboarding-verify-pause='true']");
        }
        // "pending" needs no sidebar action — the OTP-field overlay from
        // mountVerifyLoginCodeScreen stays anchored and the user clicks
        // "Verify and Save" themselves. The success transition is driven by
        // the factors_list_after_enroll stage, not by this message.
      },
    });
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

const clearStagedOnboardingCredentials = (): void => {
  const message: ClearOnboardingCredentials = {
    type: "CLEAR_ONBOARDING_CREDENTIALS",
  };
  void browser.runtime.sendMessage(message).catch((error) =>
    reportOnboardingFailure("runtime.sendMessage(CLEAR_ONBOARDING_CREDENTIALS)", error)
  );
};

const saveResumeSnapshot = async (
  snapshot: {
    readonly state: OnboardingState;
    readonly email: string;
    readonly password: string;
  }
): Promise<void> => {
  const safeState = safeResumeStateFor(snapshot.state);
  if (!safeState) {
    await clearResumeSnapshotSession();
    return;
  }
  await saveResumeSnapshotSession({
    state: safeState,
    email: snapshot.email,
    password: snapshot.password,
  });
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
  });
  repaintInterruptionActions();
};

const CUNY_REATTACHABLE_STATES: ReadonlySet<OnboardingState> = new Set([
  "OPENING_CUNY",
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
};

type OnboardingUnmountBag = {
  readonly unsubscribe: () => void;
  readonly uninstallBridge: () => void;
  readonly unwireTabClose: () => void;
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
  bag.resumeButton.removeEventListener("click", bag.handleResume);
  bag.reopenCunyButton.removeEventListener("click", bag.handleReopenCuny);
  if (!bag.suppressResumeSnapshots) void saveResumeSnapshot(bag.controller.getSnapshot());
  clearStagedOnboardingCredentials();
  bag.screenHandleRef.current?.unmount();
  bag.header.unmount();
  bag.shell.remove();
  bag.restoreVaultMainWrap();
};

const subscribeOnboardingController = (
  controller: OnboardingController,
  repaint: () => void,
  suppressResumeSnapshots: boolean
): (() => void) => {
  let lastState: OnboardingState = controller.getSnapshot().state;
  return controller.subscribe((snapshot) => {
    if (!suppressResumeSnapshots) void saveResumeSnapshot(snapshot);
    if (snapshot.state === lastState) return;
    lastState = snapshot.state;
    repaint();
  });
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

const bindOnboardingLifecycle = (model: OnboardingMountModel): (() => void) => {
  const {
    controller,
    doc,
    screenHost,
    resumeButton,
    reopenCunyButton,
    shell,
    header,
    restoreVaultMainWrap,
    suppressResumeSnapshots,
  } = model;
  const screenHandleRef = { current: null as ScreenHandle | null };
  const resumeLatch: SidebarResumeLatch = { snapshot: null };
  const isCunyTabMissingFlag = { value: false };
  const activeCunyTabIdRef = { value: null as number | null };

  const repaintInterruptionActions = (): void => {
    const currentState = controller.getSnapshot().state;
    resumeButton.hidden = resumeLatch.snapshot === null;
    reopenCunyButton.hidden =
      !CUNY_REATTACHABLE_STATES.has(currentState) || !isCunyTabMissingFlag.value;
  };

  const repaint = (): void => {
    const state = controller.getSnapshot().state;
    header.renderFor(state);
    screenHandleRef.current = renderActiveScreen(
      controller,
      screenHost,
      doc,
      screenHandleRef.current
    );
    repaintInterruptionActions();
  };

  const unsubscribe = subscribeOnboardingController(controller, repaint, suppressResumeSnapshots);

  const uninstallBridge = installRuntimeMessageBridge(
    controller,
    screenHost,
    (tabId) => {
      activeCunyTabIdRef.value = tabId;
      isCunyTabMissingFlag.value = false;
      repaintInterruptionActions();
    }
  );

  const { handleResume, handleReopenCuny, unwireTabClose } =
    registerSidebarInterruptionBindings({
      latch: resumeLatch,
      controller,
      resumeButton,
      reopenCunyButton,
      repaint,
      repaintInterruptionActions,
      activeCunyTabIdRef,
      isCunyTabMissingFlag,
    });

  repaint();
  if (!suppressResumeSnapshots) {
    void loadAndApplyResumeSnapshot((snapshot) => {
      resumeLatch.snapshot = snapshot;
    }, repaintInterruptionActions);
  }

  const bag: OnboardingUnmountBag = {
    unsubscribe,
    uninstallBridge,
    unwireTabClose,
    resumeButton,
    reopenCunyButton,
    handleResume,
    handleReopenCuny,
    controller,
    screenHandleRef,
    header,
    shell,
    restoreVaultMainWrap,
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
  });
};
