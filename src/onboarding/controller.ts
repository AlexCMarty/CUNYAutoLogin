/**
 * Onboarding controller — holds the current screen state plus in-memory-only
 * credential drafts for Screens 2 and 3, plus the last-known credential-error
 * info for inline surfacing on Screen 2/3 when CUNY rejects.
 *
 * Security invariant (enforced by absence): this module NEVER writes the email
 * or password to `browser.storage.local` or `storage.session`. Credentials
 * captured here live in closure memory until Screen 4 opens the CUNY tab (the
 * sidebar stages them into the service worker's in-memory cache via
 * `STAGE_ONBOARDING_CREDENTIALS`) and the vault-setup screen seals them into
 * the encrypted vault. The sidebar's unmount path clears that staging.
 */

import type { CredentialCulprit } from "./messages";
import type { OnboardingState } from "./state";
import { type OnboardingEvent, advance } from "./transitions";
import { DEV_MODE_NAMES } from "./devModes";

const isDevMode = (): boolean =>
  (DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE);

const logTransition = (
  from: OnboardingState,
  to: OnboardingState,
  cause: string
): void => {
  if (!isDevMode()) return;
  // eslint-disable-next-line no-console
  console.log(`[CUNYAutoLogin onboarding] ${from} -> ${to} (${cause})`);
};

export type OnboardingCredentialErrorInfo = {
  readonly culprit: CredentialCulprit;
};

export type OnboardingSnapshot = {
  readonly state: OnboardingState;
  readonly email: string;
  readonly password: string;
  readonly credentialError: OnboardingCredentialErrorInfo | null;
  /**
   * True while the student is proving an existing key via the advanced branch
   * (set on reaching `TEST_LOGIN`). Such users watch a real auto-login there, so
   * the completion flow skips `COMPLETE_DEMO` and lands on `COMPLETE_DONE`.
   *
   * Cleared when they fall back out of the proof — re-entering credentials
   * (`PASSWORD_ENTRY`/`EMAIL_ENTRY`) or switching to the guided path
   * (`OPENING_CUNY`) — so a guided finish still shows the demo. Re-entering the
   * key flow re-latches it at `TEST_LOGIN`.
   */
  readonly advancedKeyFlow: boolean;
};

type OnboardingSnapshotListener = (snapshot: OnboardingSnapshot) => void;

export type OnboardingController = {
  readonly getSnapshot: () => OnboardingSnapshot;
  readonly setState: (nextState: OnboardingState) => void;
  readonly dispatch: (event: OnboardingEvent) => void;
  readonly setEmail: (value: string) => void;
  readonly setPassword: (value: string) => void;
  readonly setCredentialError: (error: OnboardingCredentialErrorInfo | null) => void;
  readonly setAdvancedKeyFlow: (value: boolean) => void;
  readonly subscribe: (listener: OnboardingSnapshotListener) => () => void;
};

export type OnboardingControllerInit = {
  readonly initialState?: OnboardingState;
  readonly initialEmail?: string;
  readonly initialPassword?: string;
  readonly initialCredentialError?: OnboardingCredentialErrorInfo | null;
  readonly initialAdvancedKeyFlow?: boolean;
};

export const createOnboardingController = (
  init: OnboardingControllerInit = {}
): OnboardingController => {
  let state: OnboardingState = init.initialState ?? "WELCOME";
  let email = init.initialEmail ?? "";
  let password = init.initialPassword ?? "";
  let credentialError: OnboardingCredentialErrorInfo | null =
    init.initialCredentialError ?? null;
  let advancedKeyFlow = init.initialAdvancedKeyFlow ?? false;
  const listeners = new Set<OnboardingSnapshotListener>();

  const snapshot = (): OnboardingSnapshot => ({
    state,
    email,
    password,
    credentialError,
    advancedKeyFlow,
  });

  const notify = (): void => {
    const current = snapshot();
    for (const listener of listeners) listener(current);
  };

  return {
    getSnapshot: snapshot,
    setState: (nextState) => {
      if (state === nextState) return;
      const previousState = state;
      state = nextState;
      logTransition(previousState, nextState, "setState");
      notify();
    },
    dispatch: (event) => {
      let next = advance(state, event);
      if (next === null) return;
      // Entering the advanced "use your existing key" proof step marks the flow
      // so the completion path can later skip the redundant sign-in demo.
      if (next === "TEST_LOGIN") advancedKeyFlow = true;
      // Falling back out of the proof clears the latch: re-entering credentials
      // or switching to the guided path means the user never proved auto-login
      // via TEST_LOGIN, so the guided finish must still show COMPLETE_DEMO.
      // Re-entering the key flow re-latches it when TEST_LOGIN is reached again.
      else if (next === "PASSWORD_ENTRY" || next === "EMAIL_ENTRY" || next === "OPENING_CUNY") {
        advancedKeyFlow = false;
      }
      // Key-flow users already saw a real auto-login in TEST_LOGIN, so skip the
      // "Show me" demo and go straight to the final screen. The static table
      // still maps BIOMETRIC_* → COMPLETE_DEMO; the override lives here so the
      // table stays purely declarative.
      if (next === "COMPLETE_DEMO" && advancedKeyFlow) next = "COMPLETE_DONE";
      if (next === state) return;
      const previousState = state;
      state = next;
      logTransition(previousState, next, event);
      notify();
    },
    setEmail: (value) => {
      if (email === value) return;
      email = value;
      notify();
    },
    setPassword: (value) => {
      if (password === value) return;
      password = value;
      notify();
    },
    setCredentialError: (error) => {
      if (credentialError === error) return;
      // Value equality short-circuit: avoid redundant notifies when the bridge
      // re-stages the same culprit.
      if (
        credentialError &&
        error &&
        credentialError.culprit === error.culprit
      ) {
        return;
      }
      credentialError = error;
      notify();
    },
    setAdvancedKeyFlow: (value) => {
      if (advancedKeyFlow === value) return;
      advancedKeyFlow = value;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
