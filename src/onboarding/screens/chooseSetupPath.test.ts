// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

import { mountChooseSetupPathScreen } from "./chooseSetupPath";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): OnboardingScreenContext => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return {
    doc: document,
    root,
    getSnapshot: () => ({
      state: "CHOOSE_SETUP_PATH",
      email: "",
      password: "",
      credentialError: null,
      advancedKeyFlow: false,
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

describe("mountChooseSetupPathScreen", () => {
  test("renders the CHOOSE_SETUP_PATH container and headline", () => {
    mountChooseSetupPathScreen(makeCtx());
    expect(
      document.querySelector("[data-onboarding-screen='CHOOSE_SETUP_PATH']")
    ).not.toBeNull();
    expect(document.querySelector("h2")?.textContent).toContain(
      "six-digit code"
    );
  });

  test("renders all three choice cards", () => {
    mountChooseSetupPathScreen(makeCtx());
    expect(document.querySelectorAll(".onboarding-choice")).toHaveLength(3);
    expect(
      document.querySelector("[data-onboarding-choice='guided']")
    ).not.toBeNull();
    expect(
      document.querySelector("[data-onboarding-choice='reuse']")
    ).not.toBeNull();
    expect(
      document.querySelector("[data-onboarding-choice='import']")
    ).not.toBeNull();
  });

  test("the guided card is the lead card with a Recommended pill", () => {
    mountChooseSetupPathScreen(makeCtx());
    const lead = document.querySelector<HTMLElement>(
      "[data-onboarding-choice='guided']"
    )!;
    expect(lead.classList.contains("onboarding-choice--lead")).toBe(true);
    expect(lead.querySelector(".onboarding-pill")?.textContent).toBe(
      "Recommended"
    );
  });

  test("renders a labelled divider and a Back link", () => {
    mountChooseSetupPathScreen(makeCtx());
    expect(document.querySelector(".onboarding-divider")?.textContent).toBe(
      "Already have a key?"
    );
    expect(
      document.querySelector("[data-onboarding-choose-back='true']")
    ).not.toBeNull();
  });

  test("unmount removes the container", () => {
    const handle = mountChooseSetupPathScreen(makeCtx());
    handle.unmount();
    expect(
      document.querySelector("[data-onboarding-screen='CHOOSE_SETUP_PATH']")
    ).toBeNull();
  });
});
