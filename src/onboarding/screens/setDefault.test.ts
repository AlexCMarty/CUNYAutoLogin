// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";

const { sendMessageMock, sessionGetMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(message: unknown) => Promise<unknown>>(),
  sessionGetMock: vi.fn<(keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>>(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { sendMessage: sendMessageMock },
    storage: {
      session: { get: sessionGetMock },
    },
  },
}));

import { mountSetDefaultScreen, showSetDefaultOptionOverlay } from "./setDefault";
import type { OnboardingScreenContext } from "./screenContext";
import { EXTENSION_NAME, ENROLLED_FACTOR_ALIAS_SESSION_KEY } from "../../cuny/ssoSite";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "SET_DEFAULT", email: "", password: "", credentialError: null }),
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
  sessionGetMock.mockReset();
  sessionGetMock.mockResolvedValue({});
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("showSetDefaultOptionOverlay", () => {
  test("sends show overlay command with stepIndex 8 and stepTotal 8", () => {
    showSetDefaultOptionOverlay();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        stepIndex: 8,
        stepTotal: 8,
      })
    );
  });
});

describe("mountSetDefaultScreen — DOM structure", () => {
  test("renders container with data-onboarding-screen='SET_DEFAULT'", () => {
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    expect(document.querySelector("[data-onboarding-screen='SET_DEFAULT']")).not.toBeNull();
  });

  test("renders headline mentioning EXTENSION_NAME", () => {
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain(EXTENSION_NAME);
  });

  test("renders step progress showing step 7 of 8", () => {
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    const sub = document.querySelector(".onboarding-sub");
    expect(sub?.textContent).toBe("Step 7 of 8");
  });

  test("recovery message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("renders a tab hint paragraph", () => {
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    expect(document.querySelector(".onboarding-directional")).not.toBeNull();
  });
});

describe("mountSetDefaultScreen — alias from session", () => {
  test("uses EXTENSION_NAME when session has no stored alias", async () => {
    sessionGetMock.mockResolvedValue({});
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    await Promise.resolve();
    await Promise.resolve();
    // Headline should still say EXTENSION_NAME (the generic fallback)
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain(EXTENSION_NAME);
  });

  test("sends show overlay command with step 7 of 8 via async IIFE", async () => {
    sessionGetMock.mockResolvedValue({ [ENROLLED_FACTOR_ALIAS_SESSION_KEY]: "CUNYAutoLogin-a3f2" });
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    await Promise.resolve();
    await Promise.resolve();
    const calls = sendMessageMock.mock.calls.filter(
      (call) => (call[0] as { action?: string }).action === "show"
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const lastShowCall = calls[calls.length - 1]![0] as { stepIndex?: number; stepTotal?: number };
    expect(lastShowCall.stepIndex).toBe(7);
    expect(lastShowCall.stepTotal).toBe(8);
  });
});

describe("mountSetDefaultScreen — unmount", () => {
  test("unmount removes container from DOM", () => {
    const { ctx } = makeCtx();
    const handle = mountSetDefaultScreen(ctx);
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='SET_DEFAULT']")).toBeNull();
  });

  test("unmount sends hide overlay command", () => {
    const { ctx } = makeCtx();
    const handle = mountSetDefaultScreen(ctx);
    sendMessageMock.mockClear();
    handle.unmount();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" })
    );
  });
});

describe("mountSetDefaultScreen — alias from session used in recovery text", () => {
  test("recovery message uses stored alias when session has one", async () => {
    const storedAlias = "CUNYAutoLogin-a3f2";
    sessionGetMock.mockResolvedValue({ [ENROLLED_FACTOR_ALIAS_SESSION_KEY]: storedAlias });
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    await Promise.resolve();
    await Promise.resolve();
    const recovery = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(recovery.textContent).toContain(storedAlias);
  });

  test("overlay CSS selector includes stored alias when session has one", async () => {
    const storedAlias = "CUNYAutoLogin-b5c9";
    sessionGetMock.mockResolvedValue({ [ENROLLED_FACTOR_ALIAS_SESSION_KEY]: storedAlias });
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    await Promise.resolve();
    await Promise.resolve();
    // The overlay call from the async IIFE should include the alias in the CSS selector
    const showCalls = sendMessageMock.mock.calls.filter(
      (call) => (call[0] as { action?: string }).action === "show" &&
        (call[0] as { stepIndex?: number }).stepIndex === 7
    );
    expect(showCalls.length).toBeGreaterThanOrEqual(1);
    const payload = showCalls[showCalls.length - 1]![0] as {
      targetSpec?: { selector?: string };
    };
    expect(payload.targetSpec?.selector).toContain(storedAlias);
  });
});

describe("mountSetDefaultScreen — showSetDefaultOptionOverlay step details", () => {
  test("overlay targetSpec is a11y targeting 'Set as Default'", () => {
    showSetDefaultOptionOverlay();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSpec: expect.objectContaining({
          type: "a11y",
          text: "Set as Default",
        }),
      })
    );
  });

  test("overlay tooltip is 'Click Set as Default'", () => {
    showSetDefaultOptionOverlay();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tooltipText: "Click Set as Default",
      })
    );
  });
});

describe("mountSetDefaultScreen — copy strings", () => {
  test("body copy mentions Set as Default", () => {
    const { ctx } = makeCtx();
    mountSetDefaultScreen(ctx);
    const body = document.querySelector(".onboarding-body");
    expect(body?.textContent).toContain("Set as Default");
  });
});
