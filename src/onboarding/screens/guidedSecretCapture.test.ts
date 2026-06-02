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

import { mountGuidedSecretCaptureScreen } from "./guidedSecretCapture";
import type { OnboardingScreenContext } from "./screenContext";
import { PENDING_TOTP_SECRET_SESSION_KEY } from "../../cuny/ssoSite";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "GUIDED_SECRET_CAPTURE", email: "", password: "", credentialError: null, advancedKeyFlow: false }),
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
  vi.useFakeTimers();
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("mountGuidedSecretCaptureScreen — DOM structure", () => {
  test("renders container with data-onboarding-screen='GUIDED_SECRET_CAPTURE'", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    expect(document.querySelector("[data-onboarding-screen='GUIDED_SECRET_CAPTURE']")).not.toBeNull();
  });

  test("renders headline about saving the login code", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain("Save this login code");
  });

  test("renders step progress showing step 5 of 8", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const sub = document.querySelector(".onboarding-sub");
    expect(sub?.textContent).toBe("Step 5 of 8");
  });

  test("secret-confirmed status is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-secret-confirmed='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("five-factor-limit message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-five-factor-limit='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("generic recovery message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(el.hidden).toBe(true);
  });
});

describe("mountGuidedSecretCaptureScreen — overlay", () => {
  test("sends show overlay command on mount", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        stepIndex: 5,
        stepTotal: 8,
      })
    );
  });

  test("unmount sends hide overlay command", async () => {
    const { ctx } = makeCtx();
    const handle = mountGuidedSecretCaptureScreen(ctx);
    await Promise.resolve();
    sendMessageMock.mockClear();
    handle.unmount();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" })
    );
  });
});

describe("mountGuidedSecretCaptureScreen — secret polling", () => {
  test("reveals secret-confirmed element when session has a pending TOTP secret", async () => {
    sessionGetMock.mockResolvedValue({ [PENDING_TOTP_SECRET_SESSION_KEY]: "JBSWY3DPEHPK3PXP" });
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    await Promise.resolve();
    await Promise.resolve();
    const el = document.querySelector<HTMLElement>("[data-onboarding-secret-confirmed='true']")!;
    expect(el.hidden).toBe(false);
  });

  test("secret-confirmed stays hidden when session is empty", async () => {
    sessionGetMock.mockResolvedValue({});
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    await Promise.resolve();
    await Promise.resolve();
    const el = document.querySelector<HTMLElement>("[data-onboarding-secret-confirmed='true']")!;
    expect(el.hidden).toBe(true);
  });

  test("unmount clears polling interval and timeout", () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { ctx } = makeCtx();
    const handle = mountGuidedSecretCaptureScreen(ctx);
    handle.unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

describe("mountGuidedSecretCaptureScreen — DOM removal", () => {
  test("unmount removes container from DOM", () => {
    const { ctx } = makeCtx();
    const handle = mountGuidedSecretCaptureScreen(ctx);
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='GUIDED_SECRET_CAPTURE']")).toBeNull();
  });
});

describe("mountGuidedSecretCaptureScreen — copy strings", () => {
  test("headline copy is pinned", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toBe("Save this login code in the extension.");
  });

  test("body copy mentions secret key", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const body = document.querySelector(".onboarding-body");
    expect(body?.textContent).toContain("secret key");
  });

  test("tab hint mentions highlighted control", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const hint = document.querySelector(".onboarding-directional");
    expect(hint?.textContent).toContain("highlighted the next control");
  });

  test("secret-confirmed copy mentions captured", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-secret-confirmed='true']")!;
    expect(el.textContent).toContain("captured");
  });

  test("verify-later recovery is hidden initially", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    const el = document.querySelector<HTMLElement>("[data-onboarding-verify-later-recovery='true']")!;
    expect(el.hidden).toBe(true);
  });
});

describe("mountGuidedSecretCaptureScreen — polling interval fires", () => {
  test("polling reveals secret-confirmed when secret appears after mount", async () => {
    // Secret not available yet on initial call
    sessionGetMock.mockResolvedValueOnce({});
    // Secret arrives on second poll
    sessionGetMock.mockResolvedValue({ [PENDING_TOTP_SECRET_SESSION_KEY]: "JBSWY3DPEHPK3PXP" });
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    // Drain initial call
    await Promise.resolve();
    await Promise.resolve();
    const elBefore = document.querySelector<HTMLElement>("[data-onboarding-secret-confirmed='true']")!;
    expect(elBefore.hidden).toBe(true);
    // Fire the polling interval
    vi.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();
    const elAfter = document.querySelector<HTMLElement>("[data-onboarding-secret-confirmed='true']")!;
    expect(elAfter.hidden).toBe(false);
  });
});

describe("mountGuidedSecretCaptureScreen — overlay a11y targetSpec", () => {
  test("show overlay uses a11y targetSpec", () => {
    const { ctx } = makeCtx();
    mountGuidedSecretCaptureScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSpec: expect.objectContaining({ type: "a11y" }),
      })
    );
  });
});
