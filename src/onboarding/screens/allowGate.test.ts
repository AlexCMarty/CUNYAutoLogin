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

import { mountAllowGateScreen, ALLOW_GATE_SCREEN_SELECTOR, ALLOW_GATE_BACK_SELECTOR } from "./allowGate";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement; dispatched: string[] } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const dispatched: string[] = [];
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "ALLOW_GATE", email: "", password: "", credentialError: null }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: (event) => { dispatched.push(event); },
  };
  return { ctx, root, dispatched };
};

beforeEach(() => {
  sendMessageMock.mockReset();
  sendMessageMock.mockResolvedValue(undefined);
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("constants", () => {
  test("ALLOW_GATE_SCREEN_SELECTOR targets data-onboarding-screen='ALLOW_GATE'", () => {
    expect(ALLOW_GATE_SCREEN_SELECTOR).toContain("ALLOW_GATE");
  });

  test("ALLOW_GATE_BACK_SELECTOR targets the back button", () => {
    expect(ALLOW_GATE_BACK_SELECTOR).toContain("allow-back");
  });
});

describe("mountAllowGateScreen — DOM structure", () => {
  test("renders container matching ALLOW_GATE_SCREEN_SELECTOR", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    expect(document.querySelector(ALLOW_GATE_SCREEN_SELECTOR)).not.toBeNull();
  });

  test("renders headline", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain("tap");
  });

  test("renders body copy", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    expect(document.body.textContent).toContain("Allow");
  });

  test("renders Back button matching ALLOW_GATE_BACK_SELECTOR", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    expect(document.querySelector(ALLOW_GATE_BACK_SELECTOR)).not.toBeNull();
  });

  test("recovery message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const recovery = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(recovery.hidden).toBe(true);
  });
});

describe("mountAllowGateScreen — sendMessage on mount", () => {
  test("sends ONBOARDING_OVERLAY_COMMAND show on mount", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
      })
    );
  });
});

describe("mountAllowGateScreen — interactions", () => {
  test("clicking Back dispatches BACK", () => {
    const { ctx, dispatched } = makeCtx();
    mountAllowGateScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>(ALLOW_GATE_BACK_SELECTOR)!;
    btn.click();
    expect(dispatched).toContain("BACK");
  });

  test("unmount removes the container from DOM", () => {
    const { ctx } = makeCtx();
    const handle = mountAllowGateScreen(ctx);
    handle.unmount();
    expect(document.querySelector(ALLOW_GATE_SCREEN_SELECTOR)).toBeNull();
  });

  test("unmount sends ONBOARDING_OVERLAY_COMMAND hide", () => {
    const { ctx } = makeCtx();
    const handle = mountAllowGateScreen(ctx);
    sendMessageMock.mockClear();
    handle.unmount();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "hide",
      })
    );
  });

  test("unmount detaches back button click handler", () => {
    const { ctx, dispatched } = makeCtx();
    const handle = mountAllowGateScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>(ALLOW_GATE_BACK_SELECTOR)!;
    handle.unmount();
    btn.click();
    expect(dispatched).not.toContain("BACK");
  });
});
