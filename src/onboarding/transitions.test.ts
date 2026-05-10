import { describe, expect, test } from "vitest";
import { ONBOARDING_STATES, type OnboardingState } from "./state";
import {
  ALL_STATES_IN_TABLE,
  ONBOARDING_EVENTS,
  TRANSITION_TABLE,
  advance,
  backStateFor,
  canTransition,
  forwardTargetsFor,
  isAtTerminal,
  type OnboardingEvent,
} from "./transitions";

// ──── structural invariants ──────────────────────────────────────────────────

describe("TRANSITION_TABLE structure", () => {
  test("every onboarding state is keyed in the table", () => {
    for (const state of ONBOARDING_STATES) {
      expect(TRANSITION_TABLE[state]).toBeDefined();
    }
  });

  test("ALL_STATES_IN_TABLE mirrors ONBOARDING_STATES exactly", () => {
    expect(ALL_STATES_IN_TABLE).toEqual(ONBOARDING_STATES);
  });

  test("every declared target is itself a valid state", () => {
    const known = new Set<OnboardingState>(ONBOARDING_STATES);
    for (const state of ONBOARDING_STATES) {
      const entry = TRANSITION_TABLE[state];
      for (const event of Object.keys(entry) as OnboardingEvent[]) {
        const target = entry[event];
        if (target === null || target === undefined) continue;
        expect(known.has(target)).toBe(true);
      }
    }
  });

  test("only declared event names appear as table keys", () => {
    const known = new Set<OnboardingEvent>(ONBOARDING_EVENTS);
    for (const state of ONBOARDING_STATES) {
      const entry = TRANSITION_TABLE[state];
      for (const event of Object.keys(entry)) {
        expect(known.has(event as OnboardingEvent)).toBe(true);
      }
    }
  });
});

// ──── forward chain reachability ─────────────────────────────────────────────

describe("forward chain", () => {
  test("WELCOME reaches COMPLETE_DONE through documented happy-path events", () => {
    const happyPath: readonly { from: OnboardingState; event: OnboardingEvent }[] = [
      { from: "WELCOME", event: "NEXT" },
      { from: "EMAIL_ENTRY", event: "NEXT" },
      { from: "PASSWORD_ENTRY", event: "NEXT" },
      { from: "OPENING_CUNY", event: "CREDENTIALS_ACCEPTED" },
      { from: "CUNY_TOTP", event: "TOTP_DONE" },
      { from: "ALLOW_GATE", event: "ALLOW_CLICKED" },
      { from: "OAA_SPA_HOME", event: "FACTORS_LIST_READY" },
      { from: "GUIDED_MANAGE", event: "GUIDED_STEP_DONE" },
      { from: "GUIDED_ADD_FACTOR", event: "GUIDED_STEP_DONE" },
      { from: "GUIDED_FACTOR_TYPE", event: "GUIDED_STEP_DONE" },
      { from: "GUIDED_SECRET_CAPTURE", event: "SECRET_CAPTURED" },
      { from: "VERIFY_LOGIN_CODE", event: "VERIFY_SUCCEEDED" },
      { from: "SET_DEFAULT", event: "SET_DEFAULT_COMPLETED" },
      { from: "EXT_PASSWORD_SETUP", event: "EXT_PASSWORD_SAVED" },
      { from: "BIOMETRIC_OFFER", event: "BIOMETRIC_ACCEPTED" },
      { from: "BIOMETRIC_PREP", event: "BIOMETRIC_PREP_DONE" },
      { from: "COMPLETE_DEMO", event: "DEMO_FINISHED" },
    ];

    let state: OnboardingState = "WELCOME";
    for (const { from, event } of happyPath) {
      expect(state).toBe(from);
      const next = advance(state, event);
      expect(next).not.toBeNull();
      state = next as OnboardingState;
    }
    expect(state).toBe("COMPLETE_DONE");
    expect(isAtTerminal(state)).toBe(true);
  });

  test("every non-terminal state has at least one forward target", () => {
    for (const state of ONBOARDING_STATES) {
      if (state === "COMPLETE_DONE") continue;
      const targets = forwardTargetsFor(state);
      expect(targets.length).toBeGreaterThan(0);
    }
  });

  test("COMPLETE_DONE has zero forward targets (terminal)", () => {
    expect(forwardTargetsFor("COMPLETE_DONE")).toEqual([]);
  });
});

// ──── back-button contract ───────────────────────────────────────────────────

describe("back-button contract", () => {
  test("WELCOME has no back target", () => {
    expect(backStateFor("WELCOME")).toBeNull();
  });

  test("EMAIL_ENTRY → WELCOME, PASSWORD_ENTRY → EMAIL_ENTRY", () => {
    expect(backStateFor("EMAIL_ENTRY")).toBe("WELCOME");
    expect(backStateFor("PASSWORD_ENTRY")).toBe("EMAIL_ENTRY");
  });

  test("OPENING_CUNY + CUNY_TOTP + ALLOW_GATE + OAA_SPA_HOME return to PASSWORD_ENTRY (spec Screen 4/5)", () => {
    expect(backStateFor("OPENING_CUNY")).toBe("PASSWORD_ENTRY");
    expect(backStateFor("CUNY_TOTP")).toBe("PASSWORD_ENTRY");
    expect(backStateFor("ALLOW_GATE")).toBe("PASSWORD_ENTRY");
    expect(backStateFor("OAA_SPA_HOME")).toBe("PASSWORD_ENTRY");
  });

  test("guided CUNY states all restart from PASSWORD_ENTRY on back (spec Screens 6–9)", () => {
    for (const state of [
      "OAA_SPA_HOME",
      "GUIDED_MANAGE",
      "GUIDED_ADD_FACTOR",
      "GUIDED_FACTOR_TYPE",
      "GUIDED_SECRET_CAPTURE",
    ] as const) {
      expect(backStateFor(state)).toBe("PASSWORD_ENTRY");
    }
  });

  test("post-commit states disable back (Screens 10, 10a, 11, 12, 13)", () => {
    for (const state of [
      "VERIFY_LOGIN_CODE",
      "SET_DEFAULT",
      "EXT_PASSWORD_SETUP",
      "COMPLETE_DEMO",
      "COMPLETE_DONE",
    ] as const) {
      expect(backStateFor(state)).toBeNull();
    }
  });
});

// ──── advance / canTransition guards ─────────────────────────────────────────

describe("advance + canTransition", () => {
  test("undeclared (state, event) pair returns null and canTransition=false", () => {
    expect(advance("WELCOME", "VERIFY_SUCCEEDED")).toBeNull();
    expect(canTransition("WELCOME", "VERIFY_SUCCEEDED")).toBe(false);
  });

  test("declared null transitions (e.g. BACK from WELCOME) behave as disabled", () => {
    expect(canTransition("WELCOME", "BACK")).toBe(false);
  });

  test("CREDENTIAL_ERROR routes forward to PASSWORD_ENTRY (no auto-retry)", () => {
    expect(advance("CREDENTIAL_ERROR", "NEXT")).toBe("PASSWORD_ENTRY");
    expect(advance("CREDENTIAL_ERROR", "BACK")).toBe("PASSWORD_ENTRY");
  });

  test("OPENING_CUNY splits on credential outcome", () => {
    expect(advance("OPENING_CUNY", "CREDENTIAL_ERROR_DETECTED")).toBe("CREDENTIAL_ERROR");
    expect(advance("OPENING_CUNY", "CREDENTIALS_ACCEPTED")).toBe("CUNY_TOTP");
  });

  test("CUNY_TOTP advances to ALLOW_GATE on TOTP_DONE", () => {
    expect(advance("CUNY_TOTP", "TOTP_DONE")).toBe("ALLOW_GATE");
    expect(advance("CUNY_TOTP", "BACK")).toBe("PASSWORD_ENTRY");
  });

  test("COMPLETE_DEMO accepts a DEMO_REQUESTED self-loop without advancing", () => {
    expect(advance("COMPLETE_DEMO", "DEMO_REQUESTED")).toBe("COMPLETE_DEMO");
    expect(advance("COMPLETE_DEMO", "DEMO_FINISHED")).toBe("COMPLETE_DONE");
  });
});
