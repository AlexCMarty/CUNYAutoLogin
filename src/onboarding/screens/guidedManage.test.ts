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

import { mountGuidedManageScreen } from "./guidedManage";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "GUIDED_MANAGE", email: "", password: "", credentialError: null }),
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

describe("mountGuidedManageScreen", () => {
  test("renders container with data-onboarding-screen='GUIDED_MANAGE'", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    expect(document.querySelector("[data-onboarding-screen='GUIDED_MANAGE']")).not.toBeNull();
  });

  test("renders headline", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain("Add a login code");
  });

  test("renders a tab hint paragraph", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    expect(document.querySelector(".onboarding-directional")).not.toBeNull();
  });

  test("renders step progress showing step 2 of 8", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    const sub = document.querySelector(".onboarding-sub");
    expect(sub?.textContent).toBe("Step 2 of 8");
  });

  test("five-factor-limit message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-five-factor-limit='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("recovery message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("sends show overlay command on mount", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
      })
    );
  });

  test("unmount removes container and sends hide overlay command", () => {
    const { ctx } = makeCtx();
    const handle = mountGuidedManageScreen(ctx);
    sendMessageMock.mockClear();
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='GUIDED_MANAGE']")).toBeNull();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" })
    );
  });
});

describe("mountGuidedManageScreen — copy strings", () => {
  test("headline copy is pinned", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toBe("Add a login code on the CUNY tab.");
  });

  test("body copy mentions Add Authentication Factor", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    const body = document.querySelector(".onboarding-body");
    expect(body?.textContent).toContain("Add Authentication Factor");
  });

  test("tab hint mentions highlighted control", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    const hint = document.querySelector(".onboarding-directional");
    expect(hint?.textContent).toContain("highlighted the next control");
  });

  test("verify-later recovery is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-verify-later-recovery='true']")!;
    expect(el.hidden).toBe(true);
  });
});

describe("mountGuidedManageScreen — overlay command details", () => {
  test("show overlay uses css targetSpec", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSpec: expect.objectContaining({ type: "css" }),
      })
    );
  });

  test("show overlay stepIndex is 2 and stepTotal is 8", () => {
    const { ctx } = makeCtx();
    mountGuidedManageScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        stepIndex: 2,
        stepTotal: 8,
      })
    );
  });
});
