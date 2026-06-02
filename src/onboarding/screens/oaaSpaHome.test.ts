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

import { mountOaaSpaHomeScreen } from "./oaaSpaHome";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "OAA_SPA_HOME", email: "", password: "", credentialError: null }),
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

describe("mountOaaSpaHomeScreen", () => {
  test("renders container with data-onboarding-screen='OAA_SPA_HOME'", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    expect(document.querySelector("[data-onboarding-screen='OAA_SPA_HOME']")).not.toBeNull();
  });

  test("renders headline", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain("login settings");
  });

  test("renders loading indicator", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    const loading = document.querySelector("[data-onboarding-oaa-home-loading='true']");
    expect(loading).not.toBeNull();
  });

  test("renders step progress showing step 1 of 8", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    const sub = document.querySelector(".onboarding-sub");
    expect(sub?.textContent).toBe("Step 1 of 8");
  });

  test("renders a tab hint paragraph", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    expect(document.querySelector(".onboarding-directional")).not.toBeNull();
  });

  test("sends show overlay command on mount", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        stepIndex: 1,
        stepTotal: 8,
      })
    );
  });

  test("unmount removes container and sends hide overlay command", () => {
    const { ctx } = makeCtx();
    const handle = mountOaaSpaHomeScreen(ctx);
    sendMessageMock.mockClear();
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='OAA_SPA_HOME']")).toBeNull();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" })
    );
  });
});

describe("mountOaaSpaHomeScreen — copy strings", () => {
  test("headline copy is pinned", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toBe("Open your login settings on the CUNY tab.");
  });

  test("body copy mentions Manage", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    const body = document.querySelector(".onboarding-body");
    expect(body?.textContent).toContain("Manage");
  });

  test("loading label text mentions factors list", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    const loading = document.querySelector("[data-onboarding-oaa-home-loading='true']");
    expect(loading?.textContent).toContain("factors list");
  });

  test("tab hint text mentions highlighted control", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    const hint = document.querySelector(".onboarding-directional");
    expect(hint?.textContent).toContain("highlighted the next control");
  });
});

describe("mountOaaSpaHomeScreen — overlay command details", () => {
  test("show overlay uses css targetSpec", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSpec: expect.objectContaining({ type: "css" }),
      })
    );
  });

  test("tooltip text is 'Click Manage'", () => {
    const { ctx } = makeCtx();
    mountOaaSpaHomeScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tooltipText: "Click Manage",
      })
    );
  });
});
