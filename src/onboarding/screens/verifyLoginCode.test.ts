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

import { mountVerifyLoginCodeScreen } from "./verifyLoginCode";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "VERIFY_LOGIN_CODE", email: "", password: "", credentialError: null, advancedKeyFlow: false }),
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

describe("mountVerifyLoginCodeScreen", () => {
  test("renders container with data-onboarding-screen='VERIFY_LOGIN_CODE'", () => {
    const { ctx } = makeCtx();
    mountVerifyLoginCodeScreen(ctx);
    expect(document.querySelector("[data-onboarding-screen='VERIFY_LOGIN_CODE']")).not.toBeNull();
  });

  test("renders headline", () => {
    const { ctx } = makeCtx();
    mountVerifyLoginCodeScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain("fill the code");
  });

  test("renders step progress showing step 6 of 8", () => {
    const { ctx } = makeCtx();
    mountVerifyLoginCodeScreen(ctx);
    const sub = document.querySelector(".onboarding-sub");
    expect(sub?.textContent).toBe("Step 6 of 8");
  });

  test("pause message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountVerifyLoginCodeScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-verify-pause='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("recovery message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountVerifyLoginCodeScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("sends show overlay command on mount", () => {
    const { ctx } = makeCtx();
    mountVerifyLoginCodeScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        stepIndex: 6,
        stepTotal: 8,
      })
    );
  });

  test("unmount removes container and sends hide overlay command", () => {
    const { ctx } = makeCtx();
    const handle = mountVerifyLoginCodeScreen(ctx);
    sendMessageMock.mockClear();
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='VERIFY_LOGIN_CODE']")).toBeNull();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" })
    );
  });
});
