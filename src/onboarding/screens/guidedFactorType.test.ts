// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(message: unknown) => Promise<unknown>>(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { sendMessage: sendMessageMock },
  },
}));

import { mountGuidedFactorTypeScreen } from "./guidedFactorType";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "GUIDED_FACTOR_TYPE", email: "", password: "", credentialError: null, advancedKeyFlow: false }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: vi.fn(),
  };
  return { ctx, root };
};

beforeEach(() => {
  sendMessageMock.mockReset();
  sendMessageMock.mockResolvedValue(undefined);
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountGuidedFactorTypeScreen", () => {
  test("renders container with data-onboarding-screen='GUIDED_FACTOR_TYPE'", () => {
    const { ctx } = makeCtx();
    mountGuidedFactorTypeScreen(ctx);
    expect(document.querySelector("[data-onboarding-screen='GUIDED_FACTOR_TYPE']")).not.toBeNull();
  });

  test("renders headline about Mobile Authenticator", () => {
    const { ctx } = makeCtx();
    mountGuidedFactorTypeScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain("Mobile Authenticator");
  });

  test("renders step progress showing step 4 of 8", () => {
    const { ctx } = makeCtx();
    mountGuidedFactorTypeScreen(ctx);
    const sub = document.querySelector(".onboarding-sub");
    expect(sub?.textContent).toBe("Step 4 of 8");
  });

  test("five-factor-limit message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedFactorTypeScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-five-factor-limit='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("verify-later recovery is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedFactorTypeScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-verify-later-recovery='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("generic recovery message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedFactorTypeScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("sends show overlay command on mount with a11y target for TOTP menuitem", () => {
    const { ctx } = makeCtx();
    mountGuidedFactorTypeScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: expect.objectContaining({ type: "a11y" }),
        stepIndex: 4,
        stepTotal: 8,
      })
    );
  });

  test("unmount removes container and sends hide overlay command", () => {
    const { ctx } = makeCtx();
    const handle = mountGuidedFactorTypeScreen(ctx);
    sendMessageMock.mockClear();
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='GUIDED_FACTOR_TYPE']")).toBeNull();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" })
    );
  });
});
