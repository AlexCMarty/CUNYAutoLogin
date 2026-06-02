// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

import { mountTestLoginBadCredentialsScreen } from "./testLoginBadCredentials";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (email = ""): OnboardingScreenContext => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return {
    doc: document,
    root,
    getSnapshot: () => ({
      state: "TEST_LOGIN_BAD_CREDENTIALS",
      email,
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

describe("mountTestLoginBadCredentialsScreen", () => {
  test("renders the container, headline, and both actions", () => {
    mountTestLoginBadCredentialsScreen(makeCtx());
    expect(
      document.querySelector(
        "[data-onboarding-screen='TEST_LOGIN_BAD_CREDENTIALS']"
      )
    ).not.toBeNull();
    expect(document.querySelector("h2")?.textContent).toContain("didn't work");
    expect(
      document.querySelector("[data-onboarding-bad-cred-retry='true']")
    ).not.toBeNull();
    expect(
      document.querySelector("[data-onboarding-bad-cred-edit-email='true']")
    ).not.toBeNull();
  });

  test("echoes the staged email when present", () => {
    mountTestLoginBadCredentialsScreen(makeCtx("sam.lee99@login.cuny.edu"));
    expect(document.body.textContent).toContain("sam.lee99@login.cuny.edu");
  });

  test("falls back to a sample email when none is staged", () => {
    mountTestLoginBadCredentialsScreen(makeCtx());
    expect(document.querySelector("strong")?.textContent).toContain(
      "@login.cuny.edu"
    );
  });
});
