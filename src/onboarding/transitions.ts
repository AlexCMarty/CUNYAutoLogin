/**
 * Onboarding transition table — declarative event → next-state map per screen.
 *
 * This is intentionally a data table rather than imperative `switch` logic so
 * the unit tests can assert exhaustiveness (every state reachable, every state
 * has a defined back/forward contract) without exercising any real I/O.
 *
 * Events correspond to the "Expected external signal(s)" row of each state in
 * `engineering-scope-onboarding-overhaul.md §5.1`. Guards, timeouts, and
 * side effects are deferred to later plans (03, 04+); this module only decides
 * *what* the next state is, not *how* we got there.
 */

import {
  type OnboardingState,
  ONBOARDING_STATES,
  TERMINAL_STATE,
} from "./state";

/**
 * Every event the state machine reacts to. Values stay stable for future
 * wire-protocol use.
 */
export const ONBOARDING_EVENTS = [
  "NEXT",
  "BACK",
  "CREDENTIAL_ERROR_DETECTED",
  "CREDENTIAL_ERROR_ROUTE_TO_EMAIL",
  "CREDENTIALS_ACCEPTED",
  "TOTP_DONE",
  "ALLOW_CLICKED",
  "FACTORS_LIST_READY",
  "GUIDED_STEP_DONE",
  "SECRET_CAPTURED",
  "VERIFY_SUCCEEDED",
  "SET_DEFAULT_COMPLETED",
  "EXT_PASSWORD_SAVED",
  "BIOMETRIC_ACCEPTED",
  "BIOMETRIC_DECLINED",
  "BIOMETRIC_PREP_DONE",
  "DEMO_REQUESTED",
  "DEMO_FINISHED",
] as const;

export type OnboardingEvent = (typeof ONBOARDING_EVENTS)[number];

/**
 * Per-state map from event → next state. `null` means "no transition here"
 * (the renderer should ignore/disable the corresponding control, e.g. `BACK`
 * from `WELCOME`).
 *
 * `Readonly<Partial<...>>` because most states only react to a subset of events.
 */
export type TransitionEntry = Readonly<Partial<Record<OnboardingEvent, OnboardingState | null>>>;

export const TRANSITION_TABLE: Readonly<Record<OnboardingState, TransitionEntry>> = Object.freeze({
  WELCOME: Object.freeze({
    NEXT: "EMAIL_ENTRY",
    BACK: null,
  }),
  EMAIL_ENTRY: Object.freeze({
    NEXT: "PASSWORD_ENTRY",
    BACK: "WELCOME",
  }),
  PASSWORD_ENTRY: Object.freeze({
    NEXT: "OPENING_CUNY",
    BACK: "EMAIL_ENTRY",
  }),
  OPENING_CUNY: Object.freeze({
    BACK: "PASSWORD_ENTRY",
    CREDENTIAL_ERROR_DETECTED: "CREDENTIAL_ERROR",
    CREDENTIALS_ACCEPTED: "CUNY_TOTP",
  }),
  CUNY_TOTP: Object.freeze({
    BACK: "PASSWORD_ENTRY",
    TOTP_DONE: "ALLOW_GATE",
  }),
  CREDENTIAL_ERROR: Object.freeze({
    // Per spec (`overhaul-onboarding.md §Screen 4-error`) the sidebar lands on
    // Screen 3 (PASSWORD_ENTRY) with the input pre-filled. We do NOT auto-retry.
    // The bridge picks between PASSWORD_ENTRY (password/unknown culprit) and
    // EMAIL_ENTRY (email culprit) by dispatching NEXT or CREDENTIAL_ERROR_ROUTE_TO_EMAIL.
    NEXT: "PASSWORD_ENTRY",
    BACK: "PASSWORD_ENTRY",
    CREDENTIAL_ERROR_ROUTE_TO_EMAIL: "EMAIL_ENTRY",
  }),
  ALLOW_GATE: Object.freeze({
    BACK: "PASSWORD_ENTRY",
    ALLOW_CLICKED: "OAA_SPA_HOME",
  }),
  OAA_SPA_HOME: Object.freeze({
    BACK: "PASSWORD_ENTRY",
    FACTORS_LIST_READY: "GUIDED_MANAGE",
  }),
  GUIDED_MANAGE: Object.freeze({
    // BACK inside the guided flow returns to PASSWORD_ENTRY per the confirm
    // dialog spec ("Going back will restart the CUNY setup steps").
    BACK: "PASSWORD_ENTRY",
    GUIDED_STEP_DONE: "GUIDED_ADD_FACTOR",
  }),
  GUIDED_ADD_FACTOR: Object.freeze({
    BACK: "PASSWORD_ENTRY",
    GUIDED_STEP_DONE: "GUIDED_FACTOR_TYPE",
  }),
  GUIDED_FACTOR_TYPE: Object.freeze({
    BACK: "PASSWORD_ENTRY",
    GUIDED_STEP_DONE: "GUIDED_SECRET_CAPTURE",
  }),
  GUIDED_SECRET_CAPTURE: Object.freeze({
    BACK: "PASSWORD_ENTRY",
    SECRET_CAPTURED: "VERIFY_LOGIN_CODE",
  }),
  VERIFY_LOGIN_CODE: Object.freeze({
    BACK: null,
    VERIFY_SUCCEEDED: "SET_DEFAULT",
  }),
  SET_DEFAULT: Object.freeze({
    BACK: null,
    SET_DEFAULT_COMPLETED: "EXT_PASSWORD_SETUP",
  }),
  EXT_PASSWORD_SETUP: Object.freeze({
    // Screen 11: "Back button not available here" — credentials/secret staged.
    BACK: null,
    EXT_PASSWORD_SAVED: "BIOMETRIC_OFFER",
  }),
  BIOMETRIC_OFFER: Object.freeze({
    BACK: null,
    BIOMETRIC_ACCEPTED: "BIOMETRIC_PREP",
    BIOMETRIC_DECLINED: "COMPLETE_DEMO",
  }),
  BIOMETRIC_PREP: Object.freeze({
    BACK: "BIOMETRIC_OFFER",
    BIOMETRIC_PREP_DONE: "COMPLETE_DEMO",
  }),
  COMPLETE_DEMO: Object.freeze({
    BACK: null,
    DEMO_REQUESTED: "COMPLETE_DEMO",
    DEMO_FINISHED: "COMPLETE_DONE",
  }),
  COMPLETE_DONE: Object.freeze({
    BACK: null,
  }),
});

/** Returns the next state for a given (state, event), or `null` if no transition exists. */
export const advance = (
  state: OnboardingState,
  event: OnboardingEvent
): OnboardingState | null => {
  const entry = TRANSITION_TABLE[state];
  const next = entry[event];
  return next ?? null;
};

/** True iff `event` is defined and non-null on `state`. */
export const canTransition = (state: OnboardingState, event: OnboardingEvent): boolean =>
  advance(state, event) !== null;

/** Convenience: the `BACK` target for `state`, or `null` if BACK is disabled. */
export const backStateFor = (state: OnboardingState): OnboardingState | null =>
  advance(state, "BACK");

/**
 * Convenience used by tests and the renderer: lists every *reachable* next
 * state from `state`, excluding self-loops (e.g. `COMPLETE_DEMO`'s
 * `DEMO_REQUESTED` → `COMPLETE_DEMO`) and nulls.
 */
export const forwardTargetsFor = (state: OnboardingState): readonly OnboardingState[] => {
  const entry = TRANSITION_TABLE[state];
  const out: OnboardingState[] = [];
  for (const key of Object.keys(entry) as OnboardingEvent[]) {
    if (key === "BACK") continue;
    const next = entry[key];
    if (!next) continue;
    if (next === state) continue;
    if (!out.includes(next)) out.push(next);
  }
  return out;
};

/**
 * True when `state` is the terminal completion screen. Kept here (not only in
 * `state.ts`) so callers that already imported the transition module don't
 * have to pull in `TERMINAL_STATE` separately.
 */
export const isAtTerminal = (state: OnboardingState): boolean => state === TERMINAL_STATE;

/** Exhaustiveness helper: every declared state appears in the transition table. */
export const ALL_STATES_IN_TABLE: readonly OnboardingState[] = ONBOARDING_STATES;
