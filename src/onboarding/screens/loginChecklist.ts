/**
 * Shared "login checklist" — the vertical bead list shown while a real CUNY
 * auto-login runs. Used by both TEST_LOGIN (advanced "paste your key" flow) and
 * COMPLETE_DEMO (guided "You're all set." flow) so the two stay in lockstep.
 *
 * The four canonical login beads are, by index:
 *   0  Opening …            (label is per-screen: "Brightspace" / "CUNY Login")
 *   1  Filling in your email / password
 *   2  Filling in your login code
 *   3  Signed in
 *
 * Beads advance ONLY from REAL events delivered via
 * {@link LoginChecklistController.applyMessage} — there is no timer. The render
 * bridge forwards every onboarding runtime message to the active screen's
 * `onMessage` hook, and each bead spins for the real duration of its phase: the
 * active bead is always the one after the last completed phase, so it keeps
 * spinning through page transitions until the next phase actually starts.
 *
 * The final "Signed in" bead is never marked done by anything except the real
 * success signal (`signed_in`, synthesised by the sidebar from Brightspace
 * cookie detection). `signed_in` is also a catch-all completer, so a login that
 * skips the TOTP page still finishes cleanly.
 */

import type { OnboardingMessage } from "../messages";

/** Canonical bead positions (see file header). */
const BEAD_OPENING = 0;
const BEAD_CREDENTIALS = 1;
const BEAD_CODE = 2;
const BEAD_SIGNED_IN = 3;

type LoginChecklistBeginOptions = {
  /** Fired once when every bead is marked done (real `signed_in`). */
  readonly onComplete?: () => void;
};

export type LoginChecklistController = {
  /** The `.onboarding-demo-list` element — caller places it in the screen. */
  readonly element: HTMLElement;
  /** Activate the first bead. Beads then advance only on real events. */
  begin: (options?: LoginChecklistBeginOptions) => void;
  /** Advance beads in response to a real onboarding runtime message. */
  applyMessage: (message: OnboardingMessage) => void;
  /** Mark every bead done and fire `onComplete` (idempotent). */
  finishAll: () => void;
  /** Stop reacting to further messages. The element itself is removed by the caller. */
  unmount: () => void;
};

type ChecklistState = {
  readonly labels: readonly string[];
  readonly dotEls: HTMLElement[];
  readonly textEls: HTMLElement[];
  readonly lastIdx: number;
  /** -1 = idle (all pending); 0..lastIdx = that bead active; labels.length = all done. */
  activeIdx: number;
  onCompleteCb: (() => void) | undefined;
  completed: boolean;
  disposed: boolean;
};

/**
 * Maps a runtime message to the bead it should make active, or `"finish"` to
 * complete the checklist, or `null` to ignore. Login semantics are fixed (the
 * four beads above); only the first bead's *label* varies per screen.
 *
 * Each `*_filling` (and the TOTP-challenge stage) marks the start of a phase and
 * activates the next bead; the previous bead is rendered done. `credentials_done`
 * is intentionally ignored so bead 1 keeps spinning through the page transition
 * until the code phase actually begins.
 */
const targetBeadForMessage = (
  message: OnboardingMessage
): number | "finish" | null => {
  if (message.type === "ONBOARDING_LOGIN_PROGRESS") {
    switch (message.step) {
      case "credentials_filling":
        return BEAD_CREDENTIALS;
      case "credentials_done":
        return null;
      case "code_filling":
        return BEAD_CODE;
      case "code_done":
        return BEAD_SIGNED_IN;
      case "signed_in":
        return "finish";
    }
  }
  // The existing TOTP-challenge stage is a real anchor for the "code" bead.
  if (
    message.type === "ONBOARDING_STAGE_DETECTED" &&
    message.stage === "cuny_totp_challenge"
  ) {
    return BEAD_CODE;
  }
  return null;
};

const buildRows = (
  doc: Document,
  labels: readonly string[]
): { list: HTMLElement; dotEls: HTMLElement[]; textEls: HTMLElement[] } => {
  const list = doc.createElement("div");
  list.className = "onboarding-demo-list";
  const dotEls: HTMLElement[] = [];
  const textEls: HTMLElement[] = [];
  labels.forEach((label) => {
    const row = doc.createElement("div");
    row.className = "onboarding-demo-row";
    const dot = doc.createElement("span");
    dot.className = "onboarding-demo-dot";
    const text = doc.createElement("span");
    text.className = "onboarding-demo-text";
    text.textContent = label;
    row.appendChild(dot);
    row.appendChild(text);
    list.appendChild(row);
    dotEls.push(dot);
    textEls.push(text);
  });
  return { list, dotEls, textEls };
};

const renderState = (state: ChecklistState): void => {
  state.labels.forEach((label, idx) => {
    const done = idx < state.activeIdx;
    const active = idx === state.activeIdx;
    const dot = state.dotEls[idx];
    const text = state.textEls[idx];
    dot.dataset.done = done ? "true" : "false";
    dot.dataset.active = active ? "true" : "false";
    text.dataset.active = active ? "true" : "false";
    text.textContent = active ? `${label}…` : label;
  });
};

const finishAll = (state: ChecklistState): void => {
  state.activeIdx = state.labels.length;
  renderState(state);
  if (!state.completed) {
    state.completed = true;
    state.onCompleteCb?.();
  }
};

const advanceTo = (state: ChecklistState, target: number): void => {
  if (state.activeIdx >= state.labels.length) return; // finished — never reopen
  const clamped = Math.min(Math.max(target, BEAD_OPENING), state.lastIdx);
  if (clamped <= state.activeIdx) return; // monotonic — never step backward
  state.activeIdx = clamped;
  renderState(state);
};

export const buildLoginChecklist = (
  doc: Document,
  steps: readonly string[]
): LoginChecklistController => {
  const { list, dotEls, textEls } = buildRows(doc, steps);
  const state: ChecklistState = {
    labels: [...steps],
    dotEls,
    textEls,
    lastIdx: steps.length - 1,
    activeIdx: -1,
    onCompleteCb: undefined,
    completed: false,
    disposed: false,
  };

  return {
    element: list,
    begin: (options) => {
      if (state.disposed) return;
      state.onCompleteCb = options?.onComplete;
      if (state.activeIdx < BEAD_OPENING) {
        state.activeIdx = BEAD_OPENING;
        renderState(state);
      }
    },
    applyMessage: (message) => {
      if (state.disposed) return;
      const target = targetBeadForMessage(message);
      if (target === null) return;
      if (target === "finish") {
        finishAll(state);
        return;
      }
      advanceTo(state, target);
    },
    finishAll: () => {
      if (state.disposed) return;
      finishAll(state);
    },
    unmount: () => {
      state.disposed = true;
    },
  };
};
