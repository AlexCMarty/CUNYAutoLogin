// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

import { mountTestLoginBadKeyScreen } from "./testLoginBadKey";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): OnboardingScreenContext => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return {
    doc: document,
    root,
    getSnapshot: () => ({
      state: "TEST_LOGIN_BAD_KEY",
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

describe("mountTestLoginBadKeyScreen", () => {
  test("renders the container, headline, and both recovery actions", () => {
    mountTestLoginBadKeyScreen(makeCtx());
    expect(
      document.querySelector("[data-onboarding-screen='TEST_LOGIN_BAD_KEY']")
    ).not.toBeNull();
    expect(document.querySelector("h2")?.textContent).toBe(
      "That key didn't work."
    );
    expect(
      document.querySelector("[data-onboarding-bad-key-retry='true']")
        ?.textContent
    ).toBe("Re-enter key");
    expect(
      document.querySelector("[data-onboarding-bad-key-switch='true']")
        ?.textContent
    ).toBe("Set up a new code instead");
  });

  test("unmount removes the container", () => {
    const handle = mountTestLoginBadKeyScreen(makeCtx());
    handle.unmount();
    expect(
      document.querySelector("[data-onboarding-screen='TEST_LOGIN_BAD_KEY']")
    ).toBeNull();
  });
});
