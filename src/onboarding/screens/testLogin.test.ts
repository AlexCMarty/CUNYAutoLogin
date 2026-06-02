// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

import { mountTestLoginScreen } from "./testLogin";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (qaVariant?: string): OnboardingScreenContext => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return {
    doc: document,
    root,
    qaVariant,
    getSnapshot: () => ({
      state: "TEST_LOGIN",
      email: "",
      password: "",
      credentialError: null,
    }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: vi.fn(),
  };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountTestLoginScreen", () => {
  test("default (in-progress) frame: progress phase + demo-status, no success status", () => {
    mountTestLoginScreen(makeCtx());
    const section = document.querySelector<HTMLElement>(
      "[data-onboarding-screen='TEST_LOGIN']"
    )!;
    expect(section.dataset.onboardingTestPhase).toBe("progress");
    expect(document.querySelector("h2")?.textContent).toBe(
      "Let's make sure it works."
    );
    expect(document.querySelector(".onboarding-demo-status")).not.toBeNull();
    expect(document.querySelector(".onboarding-status")).toBeNull();
  });

  test("in-progress frame marks exactly one row active (the password step)", () => {
    mountTestLoginScreen(makeCtx());
    const activeDots = document.querySelectorAll(
      ".onboarding-demo-dot[data-active='true']"
    );
    expect(activeDots).toHaveLength(1);
  });

  test("qaVariant='success': success phase, signed-in headline, status line", () => {
    mountTestLoginScreen(makeCtx("success"));
    const section = document.querySelector<HTMLElement>(
      "[data-onboarding-screen='TEST_LOGIN']"
    )!;
    expect(section.dataset.onboardingTestPhase).toBe("success");
    expect(document.querySelector("h2")?.textContent).toBe("Your key works.");
    expect(document.querySelector(".onboarding-status")?.textContent).toContain(
      "Saving your vault"
    );
  });

  test("success frame marks every row done and none active", () => {
    mountTestLoginScreen(makeCtx("success"));
    expect(
      document.querySelectorAll(".onboarding-demo-dot[data-active='true']")
    ).toHaveLength(0);
    expect(
      document.querySelectorAll(".onboarding-demo-dot[data-done='true']")
    ).toHaveLength(5);
  });

  test("unmount removes the container", () => {
    const handle = mountTestLoginScreen(makeCtx());
    handle.unmount();
    expect(
      document.querySelector("[data-onboarding-screen='TEST_LOGIN']")
    ).toBeNull();
  });
});
