// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

import { mountTestLoginBadKeyScreen } from "./testLoginBadKey";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): OnboardingScreenContext & { dispatch: ReturnType<typeof vi.fn> } => {
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

  // ── testLoginBadKey dispatch behavior ─────────────────────────────────────

  test("clicking Re-enter key dispatches RETRY_KEY", () => {
    const ctx = makeCtx();
    mountTestLoginBadKeyScreen(ctx);
    document.querySelector<HTMLButtonElement>("[data-onboarding-bad-key-retry='true']")!.click();
    expect(ctx.dispatch).toHaveBeenCalledWith("RETRY_KEY");
  });

  test("clicking Set up a new code instead dispatches SWITCH_TO_GUIDED", () => {
    const ctx = makeCtx();
    mountTestLoginBadKeyScreen(ctx);
    document.querySelector<HTMLButtonElement>("[data-onboarding-bad-key-switch='true']")!.click();
    expect(ctx.dispatch).toHaveBeenCalledWith("SWITCH_TO_GUIDED");
  });

  test("after unmount retry and switch clicks dispatch nothing", () => {
    const ctx = makeCtx();
    const handle = mountTestLoginBadKeyScreen(ctx);
    const retry = document.querySelector<HTMLButtonElement>("[data-onboarding-bad-key-retry='true']")!;
    const switchGuided = document.querySelector<HTMLButtonElement>("[data-onboarding-bad-key-switch='true']")!;
    handle.unmount();
    retry.click();
    switchGuided.click();
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });
});
