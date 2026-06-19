import { describe, expect, test } from "vitest";
import { ONBOARDING_STATES, isTerminal, type OnboardingState } from "./state";
import {
  ALL_STATES_IN_TABLE,
  ONBOARDING_EVENTS,
  TRANSITION_TABLE,
  advance,
  backStateFor,
  canTransition,
  forwardTargetsFor,
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
      { from: "CHOOSE_SETUP_PATH", event: "CHOOSE_GUIDED" },
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
    expect(isTerminal(state)).toBe(true);
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
      "BIOMETRIC_OFFER",
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

  test("OPENING_CUNY splits on credential outcome", () => {
    // Credential rejection routes straight to the field to fix (no intermediate state).
    expect(advance("OPENING_CUNY", "CREDENTIAL_ERROR_DETECTED")).toBe("PASSWORD_ENTRY");
    expect(advance("OPENING_CUNY", "CREDENTIAL_ERROR_ROUTE_TO_EMAIL")).toBe("EMAIL_ENTRY");
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

  test("canTransition returns true for valid forward transitions", () => {
    expect(canTransition("WELCOME", "NEXT")).toBe(true);
    expect(canTransition("EMAIL_ENTRY", "BACK")).toBe(true);
    expect(canTransition("BIOMETRIC_OFFER", "BIOMETRIC_ACCEPTED")).toBe(true);
    expect(canTransition("BIOMETRIC_OFFER", "BIOMETRIC_DECLINED")).toBe(true);
  });

  test("BIOMETRIC_OFFER forward targets include both BIOMETRIC_PREP and COMPLETE_DEMO", () => {
    const targets = forwardTargetsFor("BIOMETRIC_OFFER");
    expect(targets).toContain("BIOMETRIC_PREP");
    expect(targets).toContain("COMPLETE_DEMO");
    expect(targets.length).toBe(2);
  });

  test("forwardTargetsFor excludes the COMPLETE_DEMO self-loop", () => {
    const targets = forwardTargetsFor("COMPLETE_DEMO");
    expect(targets).not.toContain("COMPLETE_DEMO");
    expect(targets).toContain("COMPLETE_DONE");
    expect(targets.length).toBe(1);
  });

  test("forwardTargetsFor returns no duplicates", () => {
    for (const state of ONBOARDING_STATES) {
      const targets = forwardTargetsFor(state);
      const unique = new Set(targets);
      expect(unique.size).toBe(targets.length);
    }
  });

  test("isTerminal returns false for all non-terminal states", () => {
    for (const state of ONBOARDING_STATES) {
      if (state === "COMPLETE_DONE") continue;
      expect(isTerminal(state)).toBe(false);
    }
  });

  test("advance returns null for post-commit states with BACK", () => {
    for (const state of [
      "VERIFY_LOGIN_CODE",
      "SET_DEFAULT",
      "EXT_PASSWORD_SETUP",
      "BIOMETRIC_OFFER",
      "COMPLETE_DEMO",
      "COMPLETE_DONE",
    ] as const) {
      expect(advance(state, "BACK")).toBeNull();
    }
  });

  test("BIOMETRIC_PREP BACK returns to BIOMETRIC_OFFER", () => {
    expect(advance("BIOMETRIC_PREP", "BACK")).toBe("BIOMETRIC_OFFER");
    expect(backStateFor("BIOMETRIC_PREP")).toBe("BIOMETRIC_OFFER");
  });
});

// ──── advanced key-flow branch transitions ────────────────────────────────────

describe("advanced key-flow branch transitions", () => {
  // Drive (state, event) → next directly from TRANSITION_TABLE so the test
  // data never drifts from production. Each row is [state, event, expectedNext].
  const advancedBranchCases: ReadonlyArray<[
    Parameters<typeof advance>[0],
    Parameters<typeof advance>[1],
    ReturnType<typeof advance>,
  ]> = [
    // CHOOSE_SETUP_PATH fork
    ["CHOOSE_SETUP_PATH", "CHOOSE_GUIDED",    TRANSITION_TABLE.CHOOSE_SETUP_PATH.CHOOSE_GUIDED    ?? null],
    ["CHOOSE_SETUP_PATH", "CHOOSE_REUSE_KEY", TRANSITION_TABLE.CHOOSE_SETUP_PATH.CHOOSE_REUSE_KEY ?? null],
    ["CHOOSE_SETUP_PATH", "CHOOSE_IMPORT_KEY",TRANSITION_TABLE.CHOOSE_SETUP_PATH.CHOOSE_IMPORT_KEY?? null],
    // KEY_FROM_OTHER_DEVICE
    ["KEY_FROM_OTHER_DEVICE", "KEY_CONFIRMED", TRANSITION_TABLE.KEY_FROM_OTHER_DEVICE.KEY_CONFIRMED ?? null],
    ["KEY_FROM_OTHER_DEVICE", "BACK",          TRANSITION_TABLE.KEY_FROM_OTHER_DEVICE.BACK ?? null],
    // KEY_FROM_AUTH_APP
    ["KEY_FROM_AUTH_APP", "KEY_CONFIRMED", TRANSITION_TABLE.KEY_FROM_AUTH_APP.KEY_CONFIRMED ?? null],
    ["KEY_FROM_AUTH_APP", "BACK",          TRANSITION_TABLE.KEY_FROM_AUTH_APP.BACK ?? null],
    // TEST_LOGIN outcomes
    ["TEST_LOGIN", "TEST_SUCCEEDED",       TRANSITION_TABLE.TEST_LOGIN.TEST_SUCCEEDED       ?? null],
    ["TEST_LOGIN", "TEST_BAD_CREDENTIALS", TRANSITION_TABLE.TEST_LOGIN.TEST_BAD_CREDENTIALS ?? null],
    ["TEST_LOGIN", "TEST_BAD_KEY",         TRANSITION_TABLE.TEST_LOGIN.TEST_BAD_KEY         ?? null],
    // TEST_LOGIN_BAD_CREDENTIALS recovery
    ["TEST_LOGIN_BAD_CREDENTIALS", "RETRY_CREDENTIALS", TRANSITION_TABLE.TEST_LOGIN_BAD_CREDENTIALS.RETRY_CREDENTIALS ?? null],
    ["TEST_LOGIN_BAD_CREDENTIALS", "EDIT_EMAIL",         TRANSITION_TABLE.TEST_LOGIN_BAD_CREDENTIALS.EDIT_EMAIL        ?? null],
    ["TEST_LOGIN_BAD_CREDENTIALS", "BACK",               TRANSITION_TABLE.TEST_LOGIN_BAD_CREDENTIALS.BACK              ?? null],
    // TEST_LOGIN_BAD_KEY recovery
    ["TEST_LOGIN_BAD_KEY", "RETRY_KEY",        TRANSITION_TABLE.TEST_LOGIN_BAD_KEY.RETRY_KEY        ?? null],
    ["TEST_LOGIN_BAD_KEY", "SWITCH_TO_GUIDED", TRANSITION_TABLE.TEST_LOGIN_BAD_KEY.SWITCH_TO_GUIDED ?? null],
    ["TEST_LOGIN_BAD_KEY", "BACK",             TRANSITION_TABLE.TEST_LOGIN_BAD_KEY.BACK             ?? null],
  ];

  test.each(advancedBranchCases)(
    "advance(%s, %s) === %s (from table)",
    (state, event, expected) => {
      expect(advance(state, event)).toBe(expected);
      expect(canTransition(state, event)).toBe(expected !== null);
    }
  );

  test("TEST_LOGIN BACK is disabled (null — sign-in is in flight)", () => {
    expect(advance("TEST_LOGIN", "BACK")).toBeNull();
    expect(canTransition("TEST_LOGIN", "BACK")).toBe(false);
  });

  test("CHOOSE_SETUP_PATH BACK returns to PASSWORD_ENTRY", () => {
    expect(advance("CHOOSE_SETUP_PATH", "BACK")).toBe("PASSWORD_ENTRY");
  });
});

// ──── exhaustive (state × event) matrix ──────────────────────────────────────

describe("exhaustive illegal-event matrix", () => {
  // Every (state, event) pair must either:
  //   • return the declared target from the table, OR
  //   • return null (event absent from this state's entry)
  // canTransition must agree with advance in both cases.
  for (const state of ONBOARDING_STATES) {
    for (const event of ONBOARDING_EVENTS) {
      const tableEntry = TRANSITION_TABLE[state];
      // If the event key is absent from the entry, the declared value is undefined.
      const declared = Object.prototype.hasOwnProperty.call(tableEntry, event)
        ? tableEntry[event as keyof typeof tableEntry]
        : undefined;
      const expectedResult = declared ?? null;

      test(`advance(${state}, ${event}) === ${String(expectedResult)}`, () => {
        expect(advance(state, event)).toBe(expectedResult);
        expect(canTransition(state, event)).toBe(expectedResult !== null);
      });
    }
  }
});
