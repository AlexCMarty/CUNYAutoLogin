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
};

export type OnboardingSnapshotListener = (snapshot: OnboardingSnapshot) => void;

export type OnboardingController = {
  readonly getSnapshot: () => OnboardingSnapshot;
  readonly setState: (nextState: OnboardingState) => void;
  readonly dispatch: (event: OnboardingEvent) => void;
  readonly setEmail: (value: string) => void;
  readonly setPassword: (value: string) => void;
  readonly setCredentialError: (error: OnboardingCredentialErrorInfo | null) => void;
  readonly subscribe: (listener: OnboardingSnapshotListener) => () => void;
};

export type OnboardingControllerInit = {
  readonly initialState?: OnboardingState;
  readonly initialEmail?: string;
  readonly initialPassword?: string;
  readonly initialCredentialError?: OnboardingCredentialErrorInfo | null;
};

export const createOnboardingController = (
  init: OnboardingControllerInit = {}
): OnboardingController => {
  let state: OnboardingState = init.initialState ?? "WELCOME";
  let email = init.initialEmail ?? "";
  let password = init.initialPassword ?? "";
  let credentialError: OnboardingCredentialErrorInfo | null =
    init.initialCredentialError ?? null;
  const listeners = new Set<OnboardingSnapshotListener>();

  const snapshot = (): OnboardingSnapshot => ({
    state,
    email,
    password,
    credentialError,
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
      const next = advance(state, event);
      if (next === null) return;
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
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
