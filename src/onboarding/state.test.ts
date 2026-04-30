import { describe, expect, test } from "vitest";
import {
  BEAD_LABELS,
  ONBOARDING_STATES,
  ONBOARDING_V2_ENABLED,
  RESUME_SAFE_STATE,
  STATE_TO_BEAD,
  TERMINAL_STATE,
  beadForState,
  isResumableState,
  isOnboardingState,
  isTerminal,
  safeResumeStateFor,
  type BeadStage,
  type OnboardingState,
} from "./state";

// ──── constants (pinned) ──────────────────────────────────────────────────────

describe("constants", () => {
  test("18 onboarding states declared (includes OAA_SPA_HOME for plan-07)", () => {
    expect(ONBOARDING_STATES.length).toBe(18);
  });

  test("ONBOARDING_STATES values are unique", () => {
    const unique = new Set<OnboardingState>(ONBOARDING_STATES);
    expect(unique.size).toBe(ONBOARDING_STATES.length);
  });

  test("ONBOARDING_V2_ENABLED is true — onboarding v2 ships in sidebar builds", () => {
    expect(ONBOARDING_V2_ENABLED).toBe(true);
  });

  test("TERMINAL_STATE is COMPLETE_DONE", () => {
    expect(TERMINAL_STATE).toBe("COMPLETE_DONE");
  });

  test("exactly 5 beads labeled per overhaul-onboarding.md §Progress model", () => {
    expect(Object.keys(BEAD_LABELS).length).toBe(5);
    expect(BEAD_LABELS[1]).toBe("Your info");
    expect(BEAD_LABELS[2]).toBe("First login");
    expect(BEAD_LABELS[3]).toBe("Set up login codes");
    expect(BEAD_LABELS[4]).toBe("Extension password");
    expect(BEAD_LABELS[5]).toBe("Done");
  });
});

// ──── bead mapping ────────────────────────────────────────────────────────────

describe("STATE_TO_BEAD", () => {
  test("every onboarding state has a bead assignment", () => {
    for (const state of ONBOARDING_STATES) {
      expect(STATE_TO_BEAD[state]).toBeDefined();
    }
  });

  test("every bead is in range 1..5", () => {
    const allowed: readonly BeadStage[] = [1, 2, 3, 4, 5];
    for (const state of ONBOARDING_STATES) {
      expect(allowed).toContain(STATE_TO_BEAD[state]);
    }
  });

  test("bead 1 covers welcome + credential-entry screens", () => {
    expect(beadForState("WELCOME")).toBe(1);
    expect(beadForState("EMAIL_ENTRY")).toBe(1);
    expect(beadForState("PASSWORD_ENTRY")).toBe(1);
  });

  test("bead 2 covers first-login transition + allow-gate + credential-error", () => {
    expect(beadForState("OPENING_CUNY")).toBe(2);
    expect(beadForState("CREDENTIAL_ERROR")).toBe(2);
    expect(beadForState("ALLOW_GATE")).toBe(2);
  });

  test("bead 3 covers all guided CUNY self-service screens", () => {
    expect(beadForState("OAA_SPA_HOME")).toBe(3);
    expect(beadForState("GUIDED_MANAGE")).toBe(3);
    expect(beadForState("GUIDED_ADD_FACTOR")).toBe(3);
    expect(beadForState("GUIDED_FACTOR_TYPE")).toBe(3);
    expect(beadForState("GUIDED_SECRET_CAPTURE")).toBe(3);
    expect(beadForState("VERIFY_LOGIN_CODE")).toBe(3);
    expect(beadForState("SET_DEFAULT")).toBe(3);
  });

  test("bead 4 covers extension password + biometric screens", () => {
    expect(beadForState("EXT_PASSWORD_SETUP")).toBe(4);
    expect(beadForState("BIOMETRIC_OFFER")).toBe(4);
    expect(beadForState("BIOMETRIC_PREP")).toBe(4);
  });

  test("bead 5 covers the final demo + done screens", () => {
    expect(beadForState("COMPLETE_DEMO")).toBe(5);
    expect(beadForState("COMPLETE_DONE")).toBe(5);
  });
});

// ──── type guards ─────────────────────────────────────────────────────────────

describe("isOnboardingState", () => {
  test("known state string → true", () => {
    expect(isOnboardingState("WELCOME")).toBe(true);
    expect(isOnboardingState("COMPLETE_DONE")).toBe(true);
  });

  test("unknown string → false", () => {
    expect(isOnboardingState("welcome")).toBe(false);
    expect(isOnboardingState("NOT_A_STATE")).toBe(false);
  });

  test("non-string → false", () => {
    expect(isOnboardingState(undefined)).toBe(false);
    expect(isOnboardingState(null)).toBe(false);
    expect(isOnboardingState(42)).toBe(false);
    expect(isOnboardingState({ state: "WELCOME" })).toBe(false);
  });
});

describe("isTerminal", () => {
  test("COMPLETE_DONE → true", () => {
    expect(isTerminal("COMPLETE_DONE")).toBe(true);
  });

  test("any other state → false", () => {
    for (const state of ONBOARDING_STATES) {
      if (state === "COMPLETE_DONE") continue;
      expect(isTerminal(state)).toBe(false);
    }
  });
});

describe("resume policy", () => {
  test("resume policy is defined for every onboarding state", () => {
    for (const state of ONBOARDING_STATES) {
      expect(RESUME_SAFE_STATE[state]).not.toBeUndefined();
    }
  });

  test("guided flow states are resumable in-place", () => {
    expect(safeResumeStateFor("ALLOW_GATE")).toBe("ALLOW_GATE");
    expect(safeResumeStateFor("GUIDED_MANAGE")).toBe("GUIDED_MANAGE");
    expect(safeResumeStateFor("GUIDED_SECRET_CAPTURE")).toBe("GUIDED_SECRET_CAPTURE");
    expect(safeResumeStateFor("SET_DEFAULT")).toBe("SET_DEFAULT");
  });

  test("CREDENTIAL_ERROR resumes to PASSWORD_ENTRY safe fallback", () => {
    expect(safeResumeStateFor("CREDENTIAL_ERROR")).toBe("PASSWORD_ENTRY");
  });

  test("extension password setup and terminal done are non-resumable; biometrics resume in-place", () => {
    expect(safeResumeStateFor("EXT_PASSWORD_SETUP")).toBeNull();
    expect(safeResumeStateFor("BIOMETRIC_OFFER")).toBe("BIOMETRIC_OFFER");
    expect(safeResumeStateFor("BIOMETRIC_PREP")).toBe("BIOMETRIC_PREP");
    expect(safeResumeStateFor("COMPLETE_DEMO")).toBe("COMPLETE_DEMO");
    expect(safeResumeStateFor("COMPLETE_DONE")).toBeNull();
  });

  test("isResumableState matches safeResumeStateFor nullability", () => {
    for (const state of ONBOARDING_STATES) {
      expect(isResumableState(state)).toBe(safeResumeStateFor(state) !== null);
    }
  });
});
