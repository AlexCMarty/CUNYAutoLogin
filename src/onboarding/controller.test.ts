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

  test("state transitions do not emit dev logs outside development/e2e modes", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const controller = createOnboardingController();
    controller.dispatch("NEXT");
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
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
});
