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

import { mountGuidedAddFactorScreen } from "./guidedAddFactor";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "GUIDED_ADD_FACTOR", email: "", password: "", credentialError: null, advancedKeyFlow: false }),
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

describe("mountGuidedAddFactorScreen", () => {
  test("renders container with data-onboarding-screen='GUIDED_ADD_FACTOR'", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    expect(document.querySelector("[data-onboarding-screen='GUIDED_ADD_FACTOR']")).not.toBeNull();
  });

  test("renders headline", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain("add menu");
  });

  test("renders step progress showing step 3 of 8", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const sub = document.querySelector(".onboarding-sub");
    expect(sub?.textContent).toBe("Step 3 of 8");
  });

  test("five-factor-limit message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-five-factor-limit='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("verify-later recovery is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-verify-later-recovery='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("generic recovery message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("sends show overlay command on mount", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        stepIndex: 3,
        stepTotal: 8,
      })
    );
  });

  test("unmount removes container and sends hide overlay command", () => {
    const { ctx } = makeCtx();
    const handle = mountGuidedAddFactorScreen(ctx);
    sendMessageMock.mockClear();
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='GUIDED_ADD_FACTOR']")).toBeNull();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" })
    );
  });
});

describe("mountGuidedAddFactorScreen — copy strings", () => {
  test("headline copy is pinned", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toBe("Open the add menu.");
  });

  test("body copy mentions Add Authentication Factor", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const body = document.querySelector(".onboarding-body");
    expect(body?.textContent).toContain("Add Authentication Factor");
  });

  test("tab hint copy is rendered", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const hint = document.querySelector(".onboarding-directional");
    expect(hint?.textContent).toContain("highlighted the next control");
  });

  test("five-factor-limit copy mentions five", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-five-factor-limit='true']")!;
    expect(el.textContent).toContain("five");
  });

  test("verify-later recovery copy mentions Verify", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-verify-later-recovery='true']")!;
    expect(el.textContent).toContain("Verify");
  });
});

describe("mountGuidedAddFactorScreen — overlay targetSpec", () => {
  test("show overlay uses css targetSpec", () => {
    const { ctx } = makeCtx();
    mountGuidedAddFactorScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSpec: expect.objectContaining({ type: "css" }),
      })
    );
  });
});
