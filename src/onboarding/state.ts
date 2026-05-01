/**
 * Onboarding state machine — state enum + stage-bead mapping.
 *
 * Authoritative list of screens is `engineering-scope-onboarding-overhaul.md §5.1`.
 * The five progress beads come from `overhaul-onboarding.md §Progress model`
 * (Your info → First login → Set up login codes → Extension password → Done).
 *
 * This module is side-effect-free so it is safe to import from the sidebar,
 * background, content, and Vitest without touching DOM or `browser.*`.
 */

/**
 * Every onboarding screen state. The string values are stable wire identifiers —
 * do not rename without updating message-protocol consumers in a later plan.
 */
export const ONBOARDING_STATES = [
  "WELCOME",
  "EMAIL_ENTRY",
  "PASSWORD_ENTRY",
  "OPENING_CUNY",
  "CUNY_TOTP",
  "CREDENTIAL_ERROR",
  "ALLOW_GATE",
  "OAA_SPA_HOME",
  "GUIDED_MANAGE",
  "GUIDED_ADD_FACTOR",
  "GUIDED_FACTOR_TYPE",
  "GUIDED_SECRET_CAPTURE",
  "VERIFY_LOGIN_CODE",
  "SET_DEFAULT",
  "EXT_PASSWORD_SETUP",
  "BIOMETRIC_OFFER",
  "BIOMETRIC_PREP",
  "COMPLETE_DEMO",
  "COMPLETE_DONE",
] as const;

export type OnboardingState = (typeof ONBOARDING_STATES)[number];

/** 1..5 matches the five beads rendered in the sidebar header. */
export type BeadStage = 1 | 2 | 3 | 4 | 5;

/** Display labels for the five top-level beads. Copy is locked by UX. */
export const BEAD_LABELS: Readonly<Record<BeadStage, string>> = Object.freeze({
  1: "Your info",
  2: "First login",
  3: "Set up login codes",
  4: "Extension password",
  5: "Done",
});

/**
 * Maps each onboarding state to the bead that should be *active* while the
 * student is on that screen. Bead N is "filled" only after the student leaves
 * the last state that maps to it (handled by the renderer in a later plan).
 */
export const STATE_TO_BEAD: Readonly<Record<OnboardingState, BeadStage>> = Object.freeze({
  WELCOME: 1,
  EMAIL_ENTRY: 1,
  PASSWORD_ENTRY: 1,
  OPENING_CUNY: 2,
  CUNY_TOTP: 2,
  CREDENTIAL_ERROR: 2,
  ALLOW_GATE: 2,
  OAA_SPA_HOME: 3,
  GUIDED_MANAGE: 3,
  GUIDED_ADD_FACTOR: 3,
  GUIDED_FACTOR_TYPE: 3,
  GUIDED_SECRET_CAPTURE: 3,
  VERIFY_LOGIN_CODE: 3,
  SET_DEFAULT: 3,
  EXT_PASSWORD_SETUP: 4,
  BIOMETRIC_OFFER: 4,
  BIOMETRIC_PREP: 4,
  COMPLETE_DEMO: 5,
  COMPLETE_DONE: 5,
});

export const beadForState = (state: OnboardingState): BeadStage => STATE_TO_BEAD[state];

export const isOnboardingState = (value: unknown): value is OnboardingState =>
  typeof value === "string" && (ONBOARDING_STATES as readonly string[]).includes(value);

/** Terminal state — the renderer should present the final "Done" screen and stop. */
export const TERMINAL_STATE: OnboardingState = "COMPLETE_DONE";

export const isTerminal = (state: OnboardingState): boolean => state === TERMINAL_STATE;

/**
 * Plan-11 resumability policy.
 *
 * We only resume to states that are safe without re-hydrating secrets from disk.
 * Non-resumable states return null and restart at WELCOME.
 */
export const RESUME_SAFE_STATE: Readonly<
  Record<OnboardingState, OnboardingState | null>
> = Object.freeze({
  WELCOME: null,
  EMAIL_ENTRY: "EMAIL_ENTRY",
  PASSWORD_ENTRY: "PASSWORD_ENTRY",
  OPENING_CUNY: "OPENING_CUNY",
  CUNY_TOTP: "CUNY_TOTP",
  CREDENTIAL_ERROR: "PASSWORD_ENTRY",
  ALLOW_GATE: "ALLOW_GATE",
  OAA_SPA_HOME: "OAA_SPA_HOME",
  GUIDED_MANAGE: "GUIDED_MANAGE",
  GUIDED_ADD_FACTOR: "GUIDED_ADD_FACTOR",
  GUIDED_FACTOR_TYPE: "GUIDED_FACTOR_TYPE",
  GUIDED_SECRET_CAPTURE: "GUIDED_SECRET_CAPTURE",
  VERIFY_LOGIN_CODE: "VERIFY_LOGIN_CODE",
  SET_DEFAULT: "SET_DEFAULT",
  EXT_PASSWORD_SETUP: null,
  BIOMETRIC_OFFER: "BIOMETRIC_OFFER",
  BIOMETRIC_PREP: "BIOMETRIC_PREP",
  COMPLETE_DEMO: "COMPLETE_DEMO",
  COMPLETE_DONE: null,
});

export const safeResumeStateFor = (
  state: OnboardingState
): OnboardingState | null => RESUME_SAFE_STATE[state];

export const isResumableState = (state: OnboardingState): boolean =>
  safeResumeStateFor(state) !== null;
