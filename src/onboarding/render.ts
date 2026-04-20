/**
 * Onboarding render contract + mount seam.
 *
 * This is a deliberate *skeleton* — plan-02 only introduces the routing seam
 * and the screen-renderer interface. Concrete per-screen renderers and the
 * bead header land in plan-04 onwards. Mounting when the feature flag is off
 * must be a no-op; mounting when on should render a visible "skeleton online"
 * placeholder so later plans can diff against a known starting point without
 * breaking the legacy setup/locked/unlocked path.
 *
 * Security: this module must not touch `browser.storage.local`, `storage.session`,
 * or any credential material. It is purely a rendering shell.
 */

import {
  BEAD_LABELS,
  type BeadStage,
  type OnboardingState,
  beadForState,
} from "./state";
import { type OnboardingEvent } from "./transitions";

/**
 * A per-screen renderer. Each concrete onboarding screen in a later plan will
 * export one of these. The skeleton in this file does not implement any.
 */
export type ScreenRenderer = {
  readonly state: OnboardingState;
  mount: (ctx: OnboardingRenderContext) => void;
  unmount?: () => void;
};

/**
 * Runtime context passed to each screen renderer. Kept minimal on purpose:
 * the sidebar owns the root element and the event bus; screens only render
 * into `root` and dispatch events back via `dispatch`.
 */
export type OnboardingRenderContext = {
  readonly root: HTMLElement;
  readonly currentState: OnboardingState;
  readonly bead: BeadStage;
  readonly dispatch: (event: OnboardingEvent) => void;
};

/**
 * View-model consumed by the top-of-sidebar progress bead row. The header
 * renderer (plan-04) will subscribe to this shape so each bead knows whether
 * it's pending, active, or completed.
 */
export type BeadViewModel = {
  readonly stage: BeadStage;
  readonly label: string;
  readonly status: "pending" | "active" | "completed";
};

export const beadViewModelForState = (state: OnboardingState): readonly BeadViewModel[] => {
  const active = beadForState(state);
  const stages: readonly BeadStage[] = [1, 2, 3, 4, 5];
  return stages.map((stage) => ({
    stage,
    label: BEAD_LABELS[stage],
    status: stage < active ? "completed" : stage === active ? "active" : "pending",
  }));
};

/**
 * Mount the onboarding shell inside `doc`. Returns an `unmount` that tears
 * down everything the skeleton created so the sidebar can swap back to the
 * legacy UI during development without a full reload.
 *
 * NOTE: This is intentionally a no-op-style placeholder in plan-02. It exists
 * so `sidebar.ts` can hold a real import target behind the feature toggle.
 * Concrete screen rendering is plan-04 onward.
 */
export const mountOnboarding = (doc: Document): (() => void) => {
  const host = doc.getElementById("onboarding-root") ?? doc.body;
  if (!host) return () => undefined;

  const banner = doc.createElement("div");
  banner.dataset.onboardingSkeleton = "true";
  banner.setAttribute("role", "status");
  banner.textContent =
    "CUNYAutoLogin onboarding v2 skeleton is active. Screens land in later plans.";
  host.appendChild(banner);

  return () => {
    banner.remove();
  };
};
