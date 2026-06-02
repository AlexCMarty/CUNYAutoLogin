// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { mountCompleteDoneScreen } from "./completeDone";
import type { OnboardingScreenContext } from "./screenContext";

vi.mock("webextension-polyfill", () => ({
  default: {
    sidebarAction: {
      close: vi.fn().mockResolvedValue(undefined),
    },
    sidePanel: {
      close: vi.fn().mockResolvedValue(undefined),
    },
    windows: {
      getCurrent: vi.fn().mockResolvedValue({ id: 1 }),
    },
  },
}));
import browser from "webextension-polyfill";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "COMPLETE_DONE", email: "", password: "", credentialError: null, advancedKeyFlow: false }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: vi.fn(),
  };
  return { ctx, root };
};

describe("mountCompleteDoneScreen", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("renders container with data-onboarding-screen='COMPLETE_DONE'", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    expect(root.querySelector("[data-onboarding-screen='COMPLETE_DONE']")).toBeTruthy();
  });

  test("renders completion headline", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    const h2 = root.querySelector("h2");
    expect(h2?.textContent).toBe("You're set.");
  });

  test("renders body text", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    const body = root.querySelector("p");
    expect(body?.textContent).toBeTruthy();
  });

  test("renders updated CTA copy", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    const cta = root.querySelector("button");
    expect(cta?.textContent).toBe("Get back to studying!");
  });

  test("clicking CTA closes Firefox sidebar action when available", async () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    const cta = root.querySelector("button");
    cta?.click();
    await Promise.resolve();
    const browserWithPanels = browser as typeof browser & {
      sidePanel?: { close?: ReturnType<typeof vi.fn> };
    };
    expect(vi.mocked(browser.sidebarAction!.close!)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(browserWithPanels.sidePanel!.close!)).not.toHaveBeenCalled();
  });

  test("no back button rendered", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    expect(root.querySelector("[data-onboarding-back='true']")).toBeNull();
  });

  test("no forward button rendered", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    expect(root.querySelector("[data-onboarding-forward='true']")).toBeNull();
  });

  test("unmount removes the container from the DOM", () => {
    const { ctx, root } = makeCtx();
    const handle = mountCompleteDoneScreen(ctx);
    handle.unmount();
    expect(root.querySelector("[data-onboarding-screen='COMPLETE_DONE']")).toBeNull();
  });
});

describe("mountCompleteDoneScreen dismissal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("falls back to Chromium sidePanel.close with current window id", async () => {
    const browserWithPanels = browser as unknown as {
      sidebarAction?: { close?: ReturnType<typeof vi.fn> };
      sidePanel?: { close?: ReturnType<typeof vi.fn> };
      windows: typeof browser.windows;
    };
    browserWithPanels.sidebarAction = undefined;
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    root.querySelector("button")?.click();
    await Promise.resolve();
    expect(vi.mocked(browser.windows.getCurrent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(browserWithPanels.sidePanel!.close!)).toHaveBeenCalledWith({
      windowId: 1,
    });
  });

  test("falls back to window.close when sidebar APIs are unavailable", async () => {
    const browserWithPanels = browser as unknown as {
      sidebarAction?: { close?: ReturnType<typeof vi.fn> };
      sidePanel?: { close?: ReturnType<typeof vi.fn> };
    };
    browserWithPanels.sidebarAction = undefined;
    browserWithPanels.sidePanel = undefined;
    const closeSpy = vi.spyOn(window, "close").mockImplementation(() => undefined);
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    root.querySelector("button")?.click();
    await Promise.resolve();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
