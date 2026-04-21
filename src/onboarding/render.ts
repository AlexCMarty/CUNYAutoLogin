/**
 * Onboarding render contract + mount seam.
 *
 * Plan-02 introduced a stub placeholder; plan-04 replaces the body of
 * `mountOnboarding` with a real controller + bead header + Screen 1/2/3
 * renderer. Downstream plans (05+) add more screens by registering them in the
 * same `SCREEN_MOUNTS` table — no changes to this entry point should be needed.
 *
 * Security: this module holds the email/password drafts only via the
 * controller closure. Nothing written to `browser.storage.*`. Renderer does
 * not know anything about the vault, SSO, or CUNY URLs — those belong to
 * later plans.
 */

import { mountBeadHeader } from "./beadHeader";
import {
  type OnboardingController,
  createOnboardingController,
} from "./controller";
import { mountEmailEntryScreen } from "./screens/emailEntry";
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

// Registry of plan-04 screen renderers. States without a registered mount fall
// back to the "not implemented yet" placeholder — this is deliberate so plan-05
// (OPENING_CUNY) and later plans plug in additively without touching this file
// except to add a new entry.
const SCREEN_MOUNTS: Partial<Record<OnboardingState, ScreenMount>> = {
  WELCOME: mountWelcomeScreen,
  EMAIL_ENTRY: mountEmailEntryScreen,
  PASSWORD_ENTRY: mountPasswordEntryScreen,
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
    dispatch: controller.dispatch,
  };
  return mount(ctx);
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
  // updates (setEmail, setPassword) must not rip the screen out from under the
  // student's cursor.
  let lastState: OnboardingState = controller.getSnapshot().state;
  const unsubscribe = controller.subscribe((snapshot) => {
    if (snapshot.state === lastState) return;
    lastState = snapshot.state;
    repaint();
  });

  repaint();

  return () => {
    unsubscribe();
    currentHandle?.unmount();
    header.unmount();
    shell.remove();
    restoreLegacy();
  };
};
