// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

import { mountKeyFromAuthAppScreen } from "./keyFromAuthApp";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): OnboardingScreenContext => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return {
    doc: document,
    root,
    getSnapshot: () => ({
      state: "KEY_FROM_AUTH_APP",
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

describe("mountKeyFromAuthAppScreen", () => {
  test("renders the KEY_FROM_AUTH_APP container", () => {
    mountKeyFromAuthAppScreen(makeCtx());
    expect(
      document.querySelector("[data-onboarding-screen='KEY_FROM_AUTH_APP']")
    ).not.toBeNull();
  });

  test("body and steps use authenticator-app copy", () => {
    mountKeyFromAuthAppScreen(makeCtx());
    expect(document.querySelector(".onboarding-body")?.textContent).toContain(
      "authenticator app"
    );
    const steps = document.querySelector(".onboarding-accordion-body")
      ?.textContent;
    expect(steps).toContain("Secret Key");
    expect(steps).toContain("Authenticator Key");
  });

  test("shares the live-validated key input (Confirm disabled when empty)", () => {
    mountKeyFromAuthAppScreen(makeCtx());
    const confirm = document.querySelector<HTMLButtonElement>(
      "[data-onboarding-key-confirm='true']"
    )!;
    expect(confirm.disabled).toBe(true);
  });
});
