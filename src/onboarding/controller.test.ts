import { describe, expect, test, vi } from "vitest";
import { createOnboardingController } from "./controller";

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
});
