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
});
