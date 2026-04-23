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
  type OnboardingMessage,
  isOnboardingMessage,
} from "./messages";
import { mountAllowGateScreen } from "./screens/allowGate";
import { mountEmailEntryScreen } from "./screens/emailEntry";
import { mountOpeningCunyScreen } from "./screens/openingCuny";
import { mountPasswordEntryScreen } from "./screens/passwordEntry";
import type {
  OnboardingScreenContext,
  ScreenHandle,
  ScreenMount,
} from "./screens/screenContext";
import { mountWelcomeScreen } from "./screens/welcome";
import {
  BEAD_LABELS,
  type BeadStage,
  type OnboardingState,
  beadForState,
} from "./state";
import { type OnboardingEvent } from "./transitions";

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
};

export const ONBOARDING_ROOT_ID = "onboarding-root";
export const ONBOARDING_SCREEN_HOST_SELECTOR =
  "[data-onboarding-screen-host='true']";
export const ONBOARDING_PLACEHOLDER_SELECTOR =
  "[data-onboarding-placeholder='true']";

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
    if (message.stage === "allow_gate") {
      controller.dispatch("CREDENTIALS_ACCEPTED");
    }
    return;
  }
  // ONBOARDING_OVERLAY_COMMAND / VERIFY_STATUS / REOPEN_CUNY_TAB /
  // TAB_REATTACHED land in plan-06+.
};

const installRuntimeMessageBridge = (
  controller: OnboardingController,
  screenHost: HTMLElement
): (() => void) => {
  const listener = (message: unknown): void => {
    if (!isOnboardingMessage(message)) return;
    applyOnboardingMessage(controller, message);
    // Plan-06: surface recovery message when content script reports the target
    // could not be found on the CUNY tab.
    if (
      message.type === "ONBOARDING_STAGE_DETECTED" &&
      message.stage === "target_not_found"
    ) {
      const el = screenHost.querySelector<HTMLElement>(
        "[data-onboarding-recovery-message='true']"
      );
      if (el) el.hidden = false;
    }
  };
  try {
    browser.runtime.onMessage.addListener(listener);
  } catch {
    // Non-extension context (jsdom without mock) — bridge is a no-op.
    return () => undefined;
  }
  return () => {
    try {
      browser.runtime.onMessage.removeListener(listener);
    } catch {
      // Ignore; listener registration may have failed silently.
    }
  };
};

const clearStagedOnboardingCredentials = (): void => {
  const message: ClearOnboardingCredentials = {
    type: "CLEAR_ONBOARDING_CREDENTIALS",
  };
  try {
    void browser.runtime.sendMessage(message);
  } catch {
    // Extension reloaded — SW memory is already gone.
  }
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

  const controller = createOnboardingController();
  let currentHandle: ScreenHandle | null = null;

  const repaint = (): void => {
    const state = controller.getSnapshot().state;
    header.renderFor(state);
    currentHandle = renderActiveScreen(
      controller,
      screenHost,
      doc,
      currentHandle
    );
  };

  // Only re-mount the screen when the state actually changes. Input-only
  // updates (setEmail, setPassword, setCredentialError on the active screen)
  // must not rip the screen out from under the student's cursor.
  let lastState: OnboardingState = controller.getSnapshot().state;
  const unsubscribe = controller.subscribe((snapshot) => {
    if (snapshot.state === lastState) return;
    lastState = snapshot.state;
    repaint();
  });

  const uninstallBridge = installRuntimeMessageBridge(controller, screenHost);

  repaint();

  return () => {
    unsubscribe();
    uninstallBridge();
    clearStagedOnboardingCredentials();
    currentHandle?.unmount();
    header.unmount();
    shell.remove();
    restoreLegacy();
  };
};
