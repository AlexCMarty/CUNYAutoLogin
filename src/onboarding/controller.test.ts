import { describe, expect, test, vi } from "vitest";
import { createOnboardingController } from "./controller";

// eslint-disable-next-line max-lines-per-function
describe("createOnboardingController", () => {
  test("defaults to WELCOME with empty email and password and no credential error", () => {
    const controller = createOnboardingController();
    expect(controller.getSnapshot()).toEqual({
      state: "WELCOME",
      email: "",
      password: "",
      credentialError: null,
      advancedKeyFlow: false,
    });
  });

  test("NEXT walks WELCOME → EMAIL_ENTRY → PASSWORD_ENTRY", () => {
    const controller = createOnboardingController();
    controller.dispatch("NEXT");
    expect(controller.getSnapshot().state).toBe("EMAIL_ENTRY");
    controller.dispatch("NEXT");
    expect(controller.getSnapshot().state).toBe("PASSWORD_ENTRY");
  });

  test("BACK from WELCOME is a no-op (null target in transition table)", () => {
    const controller = createOnboardingController();
    controller.dispatch("BACK");
    expect(controller.getSnapshot().state).toBe("WELCOME");
  });

  test("BACK chains PASSWORD_ENTRY → EMAIL_ENTRY → WELCOME", () => {
    const controller = createOnboardingController({ initialState: "PASSWORD_ENTRY" });
    controller.dispatch("BACK");
    expect(controller.getSnapshot().state).toBe("EMAIL_ENTRY");
    controller.dispatch("BACK");
    expect(controller.getSnapshot().state).toBe("WELCOME");
  });

  test("undeclared event is a no-op", () => {
    const controller = createOnboardingController();
    controller.dispatch("VERIFY_SUCCEEDED");
    expect(controller.getSnapshot().state).toBe("WELCOME");
  });

  test("setEmail and setPassword update the snapshot", () => {
    const controller = createOnboardingController();
    controller.setEmail("jane.doe@login.cuny.edu");
    controller.setPassword("s3cret");
    expect(controller.getSnapshot()).toEqual({
      state: "WELCOME",
      email: "jane.doe@login.cuny.edu",
      password: "s3cret",
      credentialError: null,
      advancedKeyFlow: false,
    });
  });

  test("setCredentialError stores the culprit in the snapshot", () => {
    const controller = createOnboardingController();
    controller.setCredentialError({ culprit: "password" });
    expect(controller.getSnapshot().credentialError).toEqual({
      culprit: "password",
    });
    controller.setCredentialError(null);
    expect(controller.getSnapshot().credentialError).toBeNull();
  });

  test("setCredentialError notifies subscribers and short-circuits identical values", () => {
    const controller = createOnboardingController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setCredentialError({ culprit: "password" });
    controller.setCredentialError({ culprit: "password" });
    expect(listener).toHaveBeenCalledTimes(1);
    controller.setCredentialError({ culprit: "email" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("subscribe fires on every state, email, and password change", () => {
    const controller = createOnboardingController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.dispatch("NEXT");
    controller.setEmail("a@login.cuny.edu");
    controller.setPassword("pw");
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    controller.dispatch("NEXT");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test("subscribe does not fire when a setter is called with the same value", () => {
    const controller = createOnboardingController({ initialEmail: "a@login.cuny.edu" });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setEmail("a@login.cuny.edu");
    expect(listener).not.toHaveBeenCalled();
  });

  test("dispatch does not fire listeners for no-op transitions", () => {
    const controller = createOnboardingController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.dispatch("BACK");
    controller.dispatch("VERIFY_SUCCEEDED");
    expect(listener).not.toHaveBeenCalled();
  });

  test.each([
    ["KEY_FROM_OTHER_DEVICE"],
    ["KEY_FROM_AUTH_APP"],
  ] as const)(
    "reaching TEST_LOGIN from %s sets advancedKeyFlow",
    (origin) => {
      const controller = createOnboardingController({ initialState: origin });
      expect(controller.getSnapshot().advancedKeyFlow).toBe(false);
      controller.dispatch("KEY_CONFIRMED");
      expect(controller.getSnapshot().state).toBe("TEST_LOGIN");
      expect(controller.getSnapshot().advancedKeyFlow).toBe(true);
    }
  );

  test.each([
    ["BIOMETRIC_OFFER", "BIOMETRIC_DECLINED"],
    ["BIOMETRIC_PREP", "BIOMETRIC_PREP_DONE"],
  ] as const)(
    "key-flow %s/%s skips COMPLETE_DEMO and lands on COMPLETE_DONE",
    (state, event) => {
      const controller = createOnboardingController({
        initialState: state,
        initialAdvancedKeyFlow: true,
      });
      controller.dispatch(event);
      expect(controller.getSnapshot().state).toBe("COMPLETE_DONE");
    }
  );

  test.each([
    ["BIOMETRIC_OFFER", "BIOMETRIC_DECLINED"],
    ["BIOMETRIC_PREP", "BIOMETRIC_PREP_DONE"],
  ] as const)(
    "guided %s/%s still routes to COMPLETE_DEMO",
    (state, event) => {
      const controller = createOnboardingController({ initialState: state });
      controller.dispatch(event);
      expect(controller.getSnapshot().state).toBe("COMPLETE_DEMO");
    }
  );

  test("setAdvancedKeyFlow updates the snapshot and notifies, short-circuiting identical values", () => {
    const controller = createOnboardingController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setAdvancedKeyFlow(true);
    expect(controller.getSnapshot().advancedKeyFlow).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    controller.setAdvancedKeyFlow(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("state transitions do not emit dev logs outside development/e2e modes", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const controller = createOnboardingController();
    controller.dispatch("NEXT");
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  // ── onboarding-core/dev-log-gated-only-asserts-absence [LOW] ──────────────
  // The silent-in-test case above only proves the guard suppresses; pin the
  // other half — in development mode the transition IS logged in `from -> to`
  // form — so a regression that disables dev logging or inverts the guard fails.
  test("state transitions DO emit a from->to dev log in development mode", () => {
    vi.stubEnv("MODE", "development");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const controller = createOnboardingController({ initialState: "WELCOME" });
      controller.dispatch("NEXT"); // WELCOME -> EMAIL_ENTRY
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("WELCOME -> EMAIL_ENTRY")
      );
    } finally {
      logSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  test("initialState, initialEmail, initialPassword, initialCredentialError are all honoured", () => {
    const controller = createOnboardingController({
      initialState: "BIOMETRIC_OFFER",
      initialEmail: "init@login.cuny.edu",
      initialPassword: "initpw",
      initialCredentialError: { culprit: "email" },
    });
    expect(controller.getSnapshot()).toEqual({
      state: "BIOMETRIC_OFFER",
      email: "init@login.cuny.edu",
      password: "initpw",
      credentialError: { culprit: "email" },
      advancedKeyFlow: false,
    });
  });

  test("setState transitions to a new state and notifies subscribers", () => {
    const controller = createOnboardingController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setState("GUIDED_MANAGE");
    expect(controller.getSnapshot().state).toBe("GUIDED_MANAGE");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("setState is a no-op when the target state equals the current state", () => {
    const controller = createOnboardingController({ initialState: "EMAIL_ENTRY" });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setState("EMAIL_ENTRY");
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getSnapshot().state).toBe("EMAIL_ENTRY");
  });

  test("setPassword same-value short-circuits and does not notify", () => {
    const controller = createOnboardingController({ initialPassword: "same" });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setPassword("same");
    expect(listener).not.toHaveBeenCalled();
  });

  test("setPassword with a new value notifies subscribers", () => {
    const controller = createOnboardingController({ initialPassword: "old" });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setPassword("new");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().password).toBe("new");
  });

  test("multiple subscribers all receive the same snapshot", () => {
    const controller = createOnboardingController();
    const firstSub = vi.fn();
    const secondSub = vi.fn();
    controller.subscribe(firstSub);
    controller.subscribe(secondSub);
    controller.dispatch("NEXT");
    expect(firstSub).toHaveBeenCalledTimes(1);
    expect(secondSub).toHaveBeenCalledTimes(1);
    expect(firstSub.mock.calls[0]?.[0]).toEqual(secondSub.mock.calls[0]?.[0]);
  });

  test("dispatch DEMO_REQUESTED self-loop on COMPLETE_DEMO does not notify (next === state)", () => {
    const controller = createOnboardingController({ initialState: "COMPLETE_DEMO" });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.dispatch("DEMO_REQUESTED");
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getSnapshot().state).toBe("COMPLETE_DEMO");
  });

  test("setCredentialError null-to-null short-circuits and does not notify", () => {
    const controller = createOnboardingController();
    const listener = vi.fn();
    controller.subscribe(listener);
    // credentialError starts as null, setting to null again is a no-op
    controller.setCredentialError(null);
    expect(listener).not.toHaveBeenCalled();
  });

  // ── advancedKeyFlow latch / guided-fallback behaviour ────────────────────────

  test("advancedKeyFlow resets to false after TEST_BAD_CREDENTIALS → RETRY_CREDENTIALS → PASSWORD_ENTRY", () => {
    // Drive the full advanced path: KEY_FROM_OTHER_DEVICE → TEST_LOGIN (latches)
    // → TEST_BAD_CREDENTIALS → RETRY_CREDENTIALS (falls back to PASSWORD_ENTRY).
    // Falling back out of the proof clears the latch, so a user who then finishes
    // the guided flow still watches the auto-login demo. Re-entering the key flow
    // re-latches the flag when TEST_LOGIN is reached again.
    const controller = createOnboardingController({
      initialState: "KEY_FROM_OTHER_DEVICE",
    });
    controller.dispatch("KEY_CONFIRMED"); // → TEST_LOGIN, latches advancedKeyFlow=true
    expect(controller.getSnapshot().state).toBe("TEST_LOGIN");
    expect(controller.getSnapshot().advancedKeyFlow).toBe(true);

    controller.dispatch("TEST_BAD_CREDENTIALS"); // → TEST_LOGIN_BAD_CREDENTIALS
    expect(controller.getSnapshot().state).toBe("TEST_LOGIN_BAD_CREDENTIALS");

    controller.dispatch("RETRY_CREDENTIALS"); // → PASSWORD_ENTRY (clears the latch)
    expect(controller.getSnapshot().state).toBe("PASSWORD_ENTRY");
    expect(controller.getSnapshot().advancedKeyFlow).toBe(false);
  });

  test("advancedKeyFlow resets to false after TEST_BAD_KEY → SWITCH_TO_GUIDED → OPENING_CUNY", () => {
    // The SWITCH_TO_GUIDED fallback drops the user onto the guided path; the
    // latch must clear so the guided completion shows COMPLETE_DEMO.
    const controller = createOnboardingController({
      initialState: "KEY_FROM_OTHER_DEVICE",
    });
    controller.dispatch("KEY_CONFIRMED"); // → TEST_LOGIN
    expect(controller.getSnapshot().advancedKeyFlow).toBe(true);

    controller.dispatch("TEST_BAD_KEY"); // → TEST_LOGIN_BAD_KEY
    controller.dispatch("SWITCH_TO_GUIDED"); // → OPENING_CUNY (clears the latch)

    expect(controller.getSnapshot().state).toBe("OPENING_CUNY");
    expect(controller.getSnapshot().advancedKeyFlow).toBe(false);
  });

  test("guided fallback (SWITCH_TO_GUIDED) reaches COMPLETE_DEMO, not COMPLETE_DONE", () => {
    // The concrete end-state effect of the reset: a user who fell back to the
    // guided path must still watch the auto-login demo.
    const controller = createOnboardingController({
      initialState: "KEY_FROM_OTHER_DEVICE",
    });
    controller.dispatch("KEY_CONFIRMED"); // latch advancedKeyFlow=true
    controller.dispatch("TEST_BAD_KEY");
    controller.dispatch("SWITCH_TO_GUIDED"); // → OPENING_CUNY, latch cleared
    expect(controller.getSnapshot().advancedKeyFlow).toBe(false);

    // Simulate the user completing the guided flow up to BIOMETRIC_OFFER.
    controller.setState("BIOMETRIC_OFFER");

    // advancedKeyFlow is false, so dispatch does NOT skip COMPLETE_DEMO.
    controller.dispatch("BIOMETRIC_DECLINED");
    expect(controller.getSnapshot().state).toBe("COMPLETE_DEMO");
  });

  test("RETRY_KEY keeps advancedKeyFlow latched, then a fresh TEST_LOGIN re-confirms it", () => {
    // Re-entering the key flow via RETRY_KEY stays in the proof, so the flag is
    // not cleared along the way and a second KEY_CONFIRMED keeps it true.
    const controller = createOnboardingController({
      initialState: "KEY_FROM_OTHER_DEVICE",
    });
    controller.dispatch("KEY_CONFIRMED"); // → TEST_LOGIN (true)
    controller.dispatch("TEST_BAD_KEY"); // → TEST_LOGIN_BAD_KEY
    controller.dispatch("RETRY_KEY"); // → KEY_FROM_OTHER_DEVICE (still latched)
    expect(controller.getSnapshot().advancedKeyFlow).toBe(true);
    controller.dispatch("KEY_CONFIRMED"); // → TEST_LOGIN again
    expect(controller.getSnapshot().advancedKeyFlow).toBe(true);
  });
});
