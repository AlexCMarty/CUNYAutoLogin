/**
 * Shared "login checklist" — the vertical bead list shown while a real CUNY
 * auto-login runs. Used by both TEST_LOGIN (advanced "paste your key" flow) and
 * COMPLETE_DEMO (guided "You're all set." flow) so the two stay in lockstep.
 *
 * The four canonical login beads are, by index:
 *   0  Opening …            (label is per-screen: "Brightspace" / "CUNY Login")
 *   1  Filling in your email / password
 *   2  Generating your login code
 *   3  Signed in
 *
 * Beads advance from REAL events delivered via {@link LoginChecklistController.applyMessage}
 * (the render bridge forwards every onboarding runtime message to the active
 * screen's `onMessage` hook). Because real events are sparse and a page can
 * stall, {@link LoginChecklistController.begin} also starts a timed fallback
 * that nudges the active bead forward — but the fallback NEVER completes the
 * final "Signed in" bead. That only happens on the real success signal
 * (`signed_in`, synthesised by the sidebar from Brightspace cookie detection)
 * or, for the guided demo, when `completeFinal` lets the fallback finish.
 */

import type { OnboardingMessage } from "../messages";

/** Canonical bead positions (see file header). */
const BEAD_OPENING = 0;
const BEAD_CREDENTIALS = 1;
const BEAD_CODE = 2;
const BEAD_SIGNED_IN = 3;

/** Fallback cadence — matches the previous demo feel; well under the e2e budget. */
export const DEFAULT_STEP_INTERVAL_MS = 1_500;

type LoginChecklistBeginOptions = {
  /** Fallback tick interval. Defaults to {@link DEFAULT_STEP_INTERVAL_MS}. */
  readonly intervalMs?: number;
  /**
   * When true, the fallback finishes the final ("Signed in") bead itself once
   * it reaches it (guided demo — there is no navigation to end on). When false,
   * the final bead is held active until a real `signed_in` arrives (real login).
   */
  readonly completeFinal?: boolean;
  /** Fired once when every bead is marked done (real success or `completeFinal`). */
  readonly onComplete?: () => void;
};

export type LoginChecklistController = {
  /** The `.onboarding-demo-list` element — caller places it in the screen. */
  readonly element: HTMLElement;
  /** Activate the first bead and start the timed fallback. */
  begin: (options?: LoginChecklistBeginOptions) => void;
  /** Advance beads in response to a real onboarding runtime message. */
  applyMessage: (message: OnboardingMessage) => void;
  /** Mark every bead done and fire `onComplete` (idempotent). */
  finishAll: () => void;
  /** Clear any pending fallback timer. The element itself is removed by the caller. */
  unmount: () => void;
};

type ChecklistState = {
  readonly labels: readonly string[];
  readonly dotEls: HTMLElement[];
  readonly textEls: HTMLElement[];
  readonly lastIdx: number;
  /** -1 = idle (all pending); 0..lastIdx = that bead active; labels.length = all done. */
  activeIdx: number;
  fallbackIntervalMs: number | null;
  completeFinal: boolean;
  onCompleteCb: (() => void) | undefined;
  completed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

/**
 * Maps a runtime message to the bead it should make active, or `"finish"` to
 * complete the checklist, or `null` to ignore. Login semantics are fixed (the
 * four beads above); only the first bead's *label* varies per screen.
 */
const targetBeadForMessage = (
  message: OnboardingMessage
): number | "finish" | null => {
  if (message.type === "ONBOARDING_LOGIN_PROGRESS") {
    switch (message.step) {
      case "credentials_filling":
        return BEAD_CREDENTIALS;
      case "credentials_done":
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

const clearTimer = (state: ChecklistState): void => {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
};

const finishAll = (state: ChecklistState): void => {
  clearTimer(state);
  state.fallbackIntervalMs = null;
  state.activeIdx = state.labels.length;
  renderState(state);
  if (!state.completed) {
    state.completed = true;
    state.onCompleteCb?.();
  }
};

const scheduleTick = (state: ChecklistState, intervalMs: number): void => {
  clearTimer(state);
  state.timer = setTimeout(() => {
    state.timer = null;
    if (state.activeIdx >= state.labels.length) return; // already finished
    if (state.activeIdx < state.lastIdx) {
      state.activeIdx += 1;
      renderState(state);
      scheduleTick(state, intervalMs);
    } else if (state.completeFinal) {
      finishAll(state);
    }
    // Otherwise hold the final bead active and wait for the real success.
  }, intervalMs);
};

const advanceTo = (state: ChecklistState, target: number): void => {
  if (state.activeIdx >= state.labels.length) return; // finished — never reopen
  const clamped = Math.min(Math.max(target, BEAD_OPENING), state.lastIdx);
  if (clamped <= state.activeIdx) return; // monotonic — never step backward
  state.activeIdx = clamped;
  renderState(state);
  if (state.fallbackIntervalMs !== null) scheduleTick(state, state.fallbackIntervalMs);
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
    fallbackIntervalMs: null,
    completeFinal: false,
    onCompleteCb: undefined,
    completed: false,
    timer: null,
  };

  return {
    element: list,
    begin: (options) => {
      state.fallbackIntervalMs = options?.intervalMs ?? DEFAULT_STEP_INTERVAL_MS;
      state.completeFinal = options?.completeFinal ?? false;
      state.onCompleteCb = options?.onComplete;
      if (state.activeIdx < BEAD_OPENING) {
        state.activeIdx = BEAD_OPENING;
        renderState(state);
      }
      scheduleTick(state, state.fallbackIntervalMs);
    },
    applyMessage: (message) => {
      const target = targetBeadForMessage(message);
      if (target === null) return;
      if (target === "finish") {
        finishAll(state);
        return;
      }
      advanceTo(state, target);
    },
    finishAll: () => finishAll(state),
    unmount: () => clearTimer(state),
  };
};
