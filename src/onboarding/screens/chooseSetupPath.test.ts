// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

import { mountChooseSetupPathScreen } from "./chooseSetupPath";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): OnboardingScreenContext & { dispatch: ReturnType<typeof vi.fn> } => {
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
    dispatch: vi.fn<OnboardingScreenContext["dispatch"]>(),
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

describe("mountChooseSetupPathScreen — dispatch behavior", () => {
  test("clicking the guided card dispatches CHOOSE_GUIDED", () => {
    const ctx = makeCtx();
    mountChooseSetupPathScreen(ctx);
    document.querySelector<HTMLButtonElement>("[data-onboarding-choice='guided']")!.click();
    expect(ctx.dispatch).toHaveBeenCalledWith("CHOOSE_GUIDED");
  });

  test("clicking the reuse card dispatches CHOOSE_REUSE_KEY", () => {
    const ctx = makeCtx();
    mountChooseSetupPathScreen(ctx);
    document.querySelector<HTMLButtonElement>("[data-onboarding-choice='reuse']")!.click();
    expect(ctx.dispatch).toHaveBeenCalledWith("CHOOSE_REUSE_KEY");
  });

  test("clicking the import card dispatches CHOOSE_IMPORT_KEY", () => {
    const ctx = makeCtx();
    mountChooseSetupPathScreen(ctx);
    document.querySelector<HTMLButtonElement>("[data-onboarding-choice='import']")!.click();
    expect(ctx.dispatch).toHaveBeenCalledWith("CHOOSE_IMPORT_KEY");
  });

  test("clicking Back dispatches BACK", () => {
    const ctx = makeCtx();
    mountChooseSetupPathScreen(ctx);
    document.querySelector<HTMLButtonElement>("[data-onboarding-choose-back='true']")!.click();
    expect(ctx.dispatch).toHaveBeenCalledWith("BACK");
  });

  test("after unmount all choice card and Back clicks dispatch nothing", () => {
    const ctx = makeCtx();
    const handle = mountChooseSetupPathScreen(ctx);
    const guided = document.querySelector<HTMLButtonElement>("[data-onboarding-choice='guided']")!;
    const reuse = document.querySelector<HTMLButtonElement>("[data-onboarding-choice='reuse']")!;
    const importCard = document.querySelector<HTMLButtonElement>("[data-onboarding-choice='import']")!;
    const back = document.querySelector<HTMLButtonElement>("[data-onboarding-choose-back='true']")!;
    handle.unmount();
    guided.click();
    reuse.click();
    importCard.click();
    back.click();
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });
});
