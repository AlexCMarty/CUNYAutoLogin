/**
 * Onboarding controller — holds the current screen state plus in-memory-only
 * credential drafts for Screens 2 and 3.
 *
 * Security invariant (enforced by absence): this module NEVER writes the email
 * or password to `browser.storage.local` or `storage.session`. Credentials
 * captured here live in closure memory until plan-05 opens the CUNY tab and
 * plan-09 seals them into the encrypted vault.
 *
 * Plan-04 scope: Screens 1–3 only. The controller accepts `NEXT`/`BACK` via
 * the existing `advance(...)` transition table and broadcasts snapshot updates
 * to subscribed renderers. Later plans extend the controller with richer
 * events (CREDENTIALS_ACCEPTED, ALLOW_CLICKED, etc.) — no changes to this
 * module are needed for those; they already resolve via the transition table.
 */

import type { OnboardingState } from "./state";
import { type OnboardingEvent, advance } from "./transitions";

export type OnboardingSnapshot = {
  readonly state: OnboardingState;
  readonly email: string;
  readonly password: string;
};

export type OnboardingSnapshotListener = (snapshot: OnboardingSnapshot) => void;

export type OnboardingController = {
  readonly getSnapshot: () => OnboardingSnapshot;
  readonly dispatch: (event: OnboardingEvent) => void;
  readonly setEmail: (value: string) => void;
  readonly setPassword: (value: string) => void;
  readonly subscribe: (listener: OnboardingSnapshotListener) => () => void;
};

export type OnboardingControllerInit = {
  readonly initialState?: OnboardingState;
  readonly initialEmail?: string;
  readonly initialPassword?: string;
};

export const createOnboardingController = (
  init: OnboardingControllerInit = {}
): OnboardingController => {
  let state: OnboardingState = init.initialState ?? "WELCOME";
  let email = init.initialEmail ?? "";
  let password = init.initialPassword ?? "";
  const listeners = new Set<OnboardingSnapshotListener>();

  const snapshot = (): OnboardingSnapshot => ({ state, email, password });

  const notify = (): void => {
    const current = snapshot();
    for (const listener of listeners) listener(current);
  };

  return {
    getSnapshot: snapshot,
    dispatch: (event) => {
      const next = advance(state, event);
      if (next === null) return;
      if (next === state) return;
      state = next;
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
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
