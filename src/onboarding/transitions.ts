/**
 * Onboarding transition table — declarative event → next-state map per screen.
 *
 * Kept as data (not a big `switch`) so tests can assert exhaustiveness and
 * back/forward contracts without driving real I/O.
 *
 * This module only maps (state, event) → next state. Timeouts, content-script
 * staging, and other side effects live in the controller, renderer, and worker.
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
  // Advanced "use your existing key" branch (advanced-key-flow.md §3). These are
  // declared so the transition graph is complete; no screen dispatches them yet
  // (visuals-only pass — wiring is a follow-up).
  "CHOOSE_GUIDED",
  "CHOOSE_REUSE_KEY",
  "CHOOSE_IMPORT_KEY",
  "KEY_CONFIRMED",
  "TEST_SUCCEEDED",
  "TEST_BAD_CREDENTIALS",
  "TEST_BAD_KEY",
  "RETRY_CREDENTIALS",
  "EDIT_EMAIL",
  "RETRY_KEY",
  "SWITCH_TO_GUIDED",
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
    NEXT: "CHOOSE_SETUP_PATH",
    BACK: "EMAIL_ENTRY",
  }),
  // ── Advanced "use your existing key" branch (advanced-key-flow.md §4) ──────
  CHOOSE_SETUP_PATH: Object.freeze({
    CHOOSE_GUIDED: "OPENING_CUNY",
    CHOOSE_REUSE_KEY: "KEY_FROM_OTHER_DEVICE",
    CHOOSE_IMPORT_KEY: "KEY_FROM_AUTH_APP",
    BACK: "PASSWORD_ENTRY",
  }),
  KEY_FROM_OTHER_DEVICE: Object.freeze({
    KEY_CONFIRMED: "TEST_LOGIN",
    BACK: "CHOOSE_SETUP_PATH",
  }),
  KEY_FROM_AUTH_APP: Object.freeze({
    KEY_CONFIRMED: "TEST_LOGIN",
    BACK: "CHOOSE_SETUP_PATH",
  }),
  TEST_LOGIN: Object.freeze({
    // No BACK — a real sign-in is in flight once we reach this screen.
    BACK: null,
    TEST_SUCCEEDED: "EXT_PASSWORD_SETUP",
    TEST_BAD_CREDENTIALS: "TEST_LOGIN_BAD_CREDENTIALS",
    TEST_BAD_KEY: "TEST_LOGIN_BAD_KEY",
  }),
  TEST_LOGIN_BAD_CREDENTIALS: Object.freeze({
    RETRY_CREDENTIALS: "PASSWORD_ENTRY",
    EDIT_EMAIL: "EMAIL_ENTRY",
    BACK: "PASSWORD_ENTRY",
  }),
  TEST_LOGIN_BAD_KEY: Object.freeze({
    // RETRY_KEY must return to whichever paste page the user started on; the
    // static table can't express that, so the renderer will resolve it from
    // `keyEntryOrigin` in the wiring pass. KEY_FROM_OTHER_DEVICE is the default.
    RETRY_KEY: "KEY_FROM_OTHER_DEVICE",
    SWITCH_TO_GUIDED: "OPENING_CUNY",
    BACK: "KEY_FROM_OTHER_DEVICE",
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
    // After a failed CUNY login we return to credential entry with fields
    // pre-filled and no auto-retry so the student can fix the mistake deliberately.
    // The bridge picks PASSWORD_ENTRY vs EMAIL_ENTRY via NEXT vs
    // CREDENTIAL_ERROR_ROUTE_TO_EMAIL depending on which field CUNY blamed.
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
    // Vault material is staged in memory; BACK is disabled to avoid a vague
    // partial-exit while secrets are mid-setup.
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

export const advance = (
  state: OnboardingState,
  event: OnboardingEvent
): OnboardingState | null => {
  const entry = TRANSITION_TABLE[state];
  const next = entry[event];
  return next ?? null;
};

export const canTransition = (state: OnboardingState, event: OnboardingEvent): boolean =>
  advance(state, event) !== null;

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

/** Same array as `ONBOARDING_STATES`; kept here so exhaustiveness tests can import this module only. */
export const ALL_STATES_IN_TABLE: readonly OnboardingState[] = ONBOARDING_STATES;
