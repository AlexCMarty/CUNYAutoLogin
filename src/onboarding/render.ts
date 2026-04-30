/**
 * Onboarding render contract + mount seam.
 *
 * Plan-02 introduced a stub placeholder; plan-04 replaced the body with a real
 * controller + bead header + Screens 1–3 renderer. Plan-05 registers Screen 4
 * (OPENING_CUNY) and a Screen 5 stub (ALLOW_GATE) and wires the message-bus
 * bridge that lets the content script / service worker steer the sidebar:
 *
 *   - `ONBOARDING_CREDENTIAL_ERROR { culprit }` → route to EMAIL_ENTRY (if
 *     the email is the likely culprit) or PASSWORD_ENTRY (default), with a
 *     red inline banner surfaced above the affected input.
 *   - `ONBOARDING_STAGE_DETECTED { stage: "allow_gate" }` → advance from
 *     OPENING_CUNY to ALLOW_GATE.
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
  ONBOARDING_PAGE_STAGES,
  type OnboardingMessage,
  type OnboardingPageStage,
  isOnboardingMessage,
} from "./messages";
import { mountAllowGateScreen } from "./screens/allowGate";
import { mountEmailEntryScreen } from "./screens/emailEntry";
import { mountBiometricOfferScreen } from "./screens/biometricOffer";
import { mountBiometricPrepScreen } from "./screens/biometricPrep";
import { mountCompleteDemoScreen } from "./screens/completeDemo";
import { mountCompleteDoneScreen } from "./screens/completeDone";
import { mountExtPasswordSetupScreen } from "./screens/extPasswordSetup";
import { mountGuidedAddFactorScreen } from "./screens/guidedAddFactor";
import { mountGuidedFactorTypeScreen } from "./screens/guidedFactorType";
import { mountGuidedManageScreen } from "./screens/guidedManage";
import { mountGuidedSecretCaptureScreen } from "./screens/guidedSecretCapture";
import { mountOaaSpaHomeScreen } from "./screens/oaaSpaHome";
import { mountOpeningCunyScreen } from "./screens/openingCuny";
import { mountPasswordEntryScreen } from "./screens/passwordEntry";
import { mountSetDefaultScreen, showSetDefaultOptionOverlay } from "./screens/setDefault";
import { mountVerifyLoginCodeScreen } from "./screens/verifyLoginCode";
import type {
  OnboardingScreenContext,
  ScreenHandle,
  ScreenMount,
} from "./screens/screenContext";
import { mountWelcomeScreen } from "./screens/welcome";
import { markOnboardingComplete } from "./onboardingComplete";
import {
  clearResumeSnapshotSession,
  loadResumeSnapshotFromSession,
  saveResumeSnapshotSession,
} from "./resumeSession";
import {
  BEAD_LABELS,
  type BeadStage,
  type OnboardingState,
  beadForState,
  safeResumeStateFor,
} from "./state";
import { type OnboardingEvent } from "./transitions";
import { routeByType } from "../runtime/messageRouter";

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

export type BeadViewModel = {
  readonly stage: BeadStage;
  readonly label: string;
  readonly status: "pending" | "active" | "completed";
};

export const beadViewModelForState = (
  state: OnboardingState
): readonly BeadViewModel[] => {
  const active = beadForState(state);
  const stages: readonly BeadStage[] = [1, 2, 3, 4, 5];
  return stages.map((stage) => ({
    stage,
    label: BEAD_LABELS[stage],
    status: stage < active ? "completed" : stage === active ? "active" : "pending",
  }));
};

// Plan-04 registered Screens 1–3; plan-05 adds OPENING_CUNY and a stub
// ALLOW_GATE. Later plans plug in additively without touching this file
// except to add a new entry.
const SCREEN_MOUNTS: Partial<Record<OnboardingState, ScreenMount>> = {
  WELCOME: mountWelcomeScreen,
  EMAIL_ENTRY: mountEmailEntryScreen,
  PASSWORD_ENTRY: mountPasswordEntryScreen,
  OPENING_CUNY: mountOpeningCunyScreen,
  ALLOW_GATE: mountAllowGateScreen,
  OAA_SPA_HOME: mountOaaSpaHomeScreen,
  GUIDED_MANAGE: mountGuidedManageScreen,
  GUIDED_ADD_FACTOR: mountGuidedAddFactorScreen,
  GUIDED_FACTOR_TYPE: mountGuidedFactorTypeScreen,
  GUIDED_SECRET_CAPTURE: mountGuidedSecretCaptureScreen,
  VERIFY_LOGIN_CODE: mountVerifyLoginCodeScreen,
  SET_DEFAULT: mountSetDefaultScreen,
  EXT_PASSWORD_SETUP: mountExtPasswordSetupScreen,
  BIOMETRIC_OFFER: mountBiometricOfferScreen,
  BIOMETRIC_PREP: mountBiometricPrepScreen,
  COMPLETE_DEMO: mountCompleteDemoScreen,
  COMPLETE_DONE: mountCompleteDoneScreen,
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
  hideLegacy: () => void;
  restoreLegacy: () => void;
} => {
  const configured = doc.getElementById(ONBOARDING_ROOT_ID);
  if (configured instanceof HTMLElement) {
    const wasHidden = configured.hidden;
    const legacy = doc.querySelector<HTMLElement>("main.wrap");
    const legacyWasHidden = legacy?.hidden ?? true;
    return {
      host: configured,
      hideLegacy: () => {
        configured.hidden = false;
        if (legacy) legacy.hidden = true;
      },
      restoreLegacy: () => {
        configured.hidden = wasHidden;
        if (legacy) legacy.hidden = legacyWasHidden;
      },
    };
  }
  const fallback = doc.body;
  return {
    host: fallback,
    hideLegacy: () => undefined,
    restoreLegacy: () => undefined,
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

/**
 * Applies an onboarding wire message to the controller. Exported for unit
 * tests so we can exercise the routing logic without standing up a full
 * runtime.onMessage stub. Plan-05 recognises two messages:
 *   - CREDENTIAL_ERROR → route to the culprit-specific correction screen,
 *     stash the `credentialError` info so the renderer can show the banner.
 *   - STAGE_DETECTED(allow_gate) → advance past OPENING_CUNY.
 * Others are ignored (plan-06+ will wire overlay commands, verify status,
 * tab reattach, etc.).
 */
export const applyOnboardingMessage = (
  controller: OnboardingController,
  message: OnboardingMessage
): void => {
  const fastForwardToVerifyLogin = (): void => {
    let guard = 0;
    while (controller.getSnapshot().state !== "VERIFY_LOGIN_CODE" && guard < 10) {
      guard += 1;
      const state = controller.getSnapshot().state;
      if (state === "ALLOW_GATE") {
        controller.dispatch("ALLOW_CLICKED");
      } else if (state === "OAA_SPA_HOME") {
        controller.dispatch("FACTORS_LIST_READY");
      } else if (
        state === "GUIDED_MANAGE" ||
        state === "GUIDED_ADD_FACTOR" ||
        state === "GUIDED_FACTOR_TYPE"
      ) {
        controller.dispatch("GUIDED_STEP_DONE");
      } else if (state === "GUIDED_SECRET_CAPTURE") {
        controller.dispatch("SECRET_CAPTURED");
      } else {
        break;
      }
    }
  };
  const fastForwardToSetDefault = (): void => {
    fastForwardToVerifyLogin();
    if (controller.getSnapshot().state === "VERIFY_LOGIN_CODE") {
      controller.dispatch("VERIFY_SUCCEEDED");
    }
  };
  const dispatchIfState = (
    state: OnboardingState,
    event: OnboardingEvent
  ): void => {
    if (controller.getSnapshot().state === state) {
      controller.dispatch(event);
    }
  };
  const dispatchSequence = (events: readonly OnboardingEvent[]): void => {
    for (const event of events) controller.dispatch(event);
  };
  const handleAllowGate = (): void => {
    controller.dispatch("CREDENTIALS_ACCEPTED");
  };
  const handleAllowButtonClicked = (): void => {
    dispatchIfState("ALLOW_GATE", "ALLOW_CLICKED");
  };
  const handleOaaSpaHome = (): void => {
    dispatchIfState("ALLOW_GATE", "ALLOW_CLICKED");
  };
  const handleAddFactor = (): void => {
    const state = controller.getSnapshot().state;
    if (state === "GUIDED_MANAGE") {
      controller.dispatch("GUIDED_STEP_DONE");
      dispatchIfState("GUIDED_ADD_FACTOR", "GUIDED_STEP_DONE");
      return;
    }
    if (state === "GUIDED_ADD_FACTOR") {
      controller.dispatch("GUIDED_STEP_DONE");
    }
  };
  const handleFactorTypeSelect = (): void => {
    dispatchIfState("GUIDED_ADD_FACTOR", "GUIDED_STEP_DONE");
  };
  const handleFactorsList = (): void => {
    const state = controller.getSnapshot().state;
    if (state === "ALLOW_GATE") {
      dispatchSequence(["ALLOW_CLICKED", "FACTORS_LIST_READY", "GUIDED_STEP_DONE"]);
      return;
    }
    if (state === "OAA_SPA_HOME") {
      controller.dispatch("FACTORS_LIST_READY");
    }
  };
  const handleTotpEnrollSecret = (): void => {
    let state = controller.getSnapshot().state;
    if (state === "ALLOW_GATE") {
      dispatchSequence([
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
  const handleTotpEnrollVerify = (): void => {
    const state = controller.getSnapshot().state;
    if (state === "GUIDED_SECRET_CAPTURE") {
      controller.dispatch("SECRET_CAPTURED");
      return;
    }
    if (state === "ALLOW_GATE" || state === "OAA_SPA_HOME") {
      fastForwardToVerifyLogin();
    }
  };
  const handleFactorsListAfterEnroll = (): void => {
    const state = controller.getSnapshot().state;
    if (state === "VERIFY_LOGIN_CODE") {
      controller.dispatch("VERIFY_SUCCEEDED");
      return;
    }
    if (
      state === "ALLOW_GATE" ||
      state === "OAA_SPA_HOME" ||
      state === "GUIDED_MANAGE" ||
      state === "GUIDED_ADD_FACTOR" ||
      state === "GUIDED_FACTOR_TYPE" ||
      state === "GUIDED_SECRET_CAPTURE"
    ) {
      fastForwardToSetDefault();
    }
  };
  const handleSetDefaultMenuOpened = (): void => {
    if (controller.getSnapshot().state === "SET_DEFAULT") {
      showSetDefaultOptionOverlay();
    }
  };
  const handleSetDefaultConfirmed = (): void => {
    dispatchIfState("SET_DEFAULT", "SET_DEFAULT_COMPLETED");
  };
  const noopHandler = (): void => undefined;
  const stageDetectedHandlers = Object.freeze({
    credential_page: noopHandler,
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
  } satisfies Record<OnboardingPageStage, () => void>);
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
    stageDetectedHandlers[message.stage]();
    return;
  }
  // ONBOARDING_OVERLAY_COMMAND / VERIFY_STATUS / REOPEN_CUNY_TAB /
  // TAB_REATTACHED land in plan-06+.
};

export const ONBOARDING_STAGE_ROUTER_KEYS = ONBOARDING_PAGE_STAGES;

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
  try {
    void browser.runtime.sendMessage(message);
  } catch (error) {
    // Extension reloaded — SW memory is already gone.
    reportOnboardingFailure("runtime.sendMessage(CLEAR_ONBOARDING_CREDENTIALS)", error);
  }
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

export const mountOnboarding = (doc: Document): (() => void) => {
  const { host, hideLegacy, restoreLegacy } = resolveScreenHost(doc);
  hideLegacy();

  const shell = doc.createElement("div");
  shell.dataset.onboardingShell = "true";
  shell.className = "onboarding-shell";
  host.appendChild(shell);

  const header = mountBeadHeader(doc, shell);

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

  const controller = createOnboardingController();
  let currentHandle: ScreenHandle | null = null;
  let pendingResumeSnapshot: PendingResumeSnapshot | null = null;
  let isCunyTabMissing = false;
  let activeCunyTabId: number | null = null;
  const CUNY_REATTACHABLE_STATES = new Set<OnboardingState>([
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

  const repaintInterruptionActions = (): void => {
    const currentState = controller.getSnapshot().state;
    resumeButton.hidden = pendingResumeSnapshot === null;
    reopenCunyButton.hidden =
      !CUNY_REATTACHABLE_STATES.has(currentState) || !isCunyTabMissing;
  };

  const repaint = (): void => {
    const state = controller.getSnapshot().state;
    header.renderFor(state);
    currentHandle = renderActiveScreen(
      controller,
      screenHost,
      doc,
      currentHandle
    );
    repaintInterruptionActions();
  };

  // Only re-mount the screen when the state actually changes. Input-only
  // updates (setEmail, setPassword, setCredentialError on the active screen)
  // must not rip the screen out from under the student's cursor.
  let lastState: OnboardingState = controller.getSnapshot().state;
  const unsubscribe = controller.subscribe((snapshot) => {
    void saveResumeSnapshot(snapshot);
    if (snapshot.state === "COMPLETE_DONE" && snapshot.state !== lastState) {
      void markOnboardingComplete();
    }
    if (snapshot.state === lastState) return;
    lastState = snapshot.state;
    repaint();
  });

  const uninstallBridge = installRuntimeMessageBridge(
    controller,
    screenHost,
    (tabId) => {
      activeCunyTabId = tabId;
      isCunyTabMissing = false;
      repaintInterruptionActions();
    }
  );

  const handleResume = (): void => {
    if (!pendingResumeSnapshot) return;
    controller.setEmail(pendingResumeSnapshot.email);
    controller.setPassword(pendingResumeSnapshot.password);
    controller.setState(pendingResumeSnapshot.state);
    pendingResumeSnapshot = null;
    repaint();
  };
  resumeButton.addEventListener("click", handleResume);

  const handleReopenCuny = (): void => {
    const message: OnboardingMessage = { type: "ONBOARDING_REOPEN_CUNY_TAB" };
    isCunyTabMissing = false;
    repaintInterruptionActions();
    void browser.runtime.sendMessage(message).catch(() => undefined);
  };
  reopenCunyButton.addEventListener("click", handleReopenCuny);

  const tabsOnRemoved = (browser.tabs as unknown as {
    onRemoved?: {
      addListener?: (listener: (tabId: number, removeInfo: unknown) => void) => void;
      removeListener?: (listener: (tabId: number, removeInfo: unknown) => void) => void;
    };
  }).onRemoved;
  const onTabRemoved = (tabId: number): void => {
    if (activeCunyTabId === null) return;
    if (tabId !== activeCunyTabId) return;
    activeCunyTabId = null;
    isCunyTabMissing = true;
    repaintInterruptionActions();
  };
  try {
    tabsOnRemoved?.addListener?.(onTabRemoved);
  } catch (error) {
    // Ignore when tabs API is unavailable.
    reportOnboardingFailure("tabs.onRemoved.addListener", error);
  }

  repaint();
  void loadResumeSnapshotFromSession().then((snapshot) => {
    if (!snapshot) return;
    pendingResumeSnapshot = {
      state: snapshot.state,
      email: snapshot.email ?? "",
      password: snapshot.password ?? "",
    };
    repaintInterruptionActions();
  });

  return () => {
    unsubscribe();
    uninstallBridge();
    try {
      tabsOnRemoved?.removeListener?.(onTabRemoved);
    } catch (error) {
      // Ignore remove failures in non-extension contexts.
      reportOnboardingFailure("tabs.onRemoved.removeListener", error);
    }
    resumeButton.removeEventListener("click", handleResume);
    reopenCunyButton.removeEventListener("click", handleReopenCuny);
    void saveResumeSnapshot(controller.getSnapshot());
    clearStagedOnboardingCredentials();
    currentHandle?.unmount();
    header.unmount();
    shell.remove();
    restoreLegacy();
  };
};
