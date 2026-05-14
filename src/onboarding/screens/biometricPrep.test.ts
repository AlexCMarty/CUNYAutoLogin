// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { ok, err } from "neverthrow";

const { sendMessageMock, sessionGetMock, enrollBiometricMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(message: unknown) => Promise<unknown>>(),
  sessionGetMock: vi.fn<(keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>>(),
  enrollBiometricMock: vi.fn(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { sendMessage: sendMessageMock },
    storage: {
      session: { get: sessionGetMock },
    },
  },
}));

vi.mock("../../crypto/biometric", () => ({
  enrollBiometric: enrollBiometricMock,
}));

import { mountBiometricPrepScreen } from "./biometricPrep";
import type { OnboardingScreenContext } from "./screenContext";
import { SESSION_MASTER_KEY } from "../../cuny/ssoSite";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement; dispatched: string[] } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const dispatched: string[] = [];
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "BIOMETRIC_PREP", email: "", password: "", credentialError: null }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: (event) => { dispatched.push(event); },
  };
  return { ctx, root, dispatched };
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  sendMessageMock.mockReset().mockResolvedValue(undefined);
  sessionGetMock.mockReset().mockResolvedValue({ [SESSION_MASTER_KEY]: "correct-horse" });
  enrollBiometricMock.mockReset().mockResolvedValue(ok(undefined));
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountBiometricPrepScreen — DOM structure", () => {
  test("renders container with data-onboarding-screen='BIOMETRIC_PREP'", () => {
    const { ctx } = makeCtx();
    mountBiometricPrepScreen(ctx);
    expect(document.querySelector("[data-onboarding-screen='BIOMETRIC_PREP']")).not.toBeNull();
  });

  test("renders headline about biometric unlock", () => {
    const { ctx } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain("biometric unlock");
  });

  test("renders Continue button", () => {
    const { ctx } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const btn = document.querySelector("[data-onboarding-biometric-prep-continue='true']");
    expect(btn).not.toBeNull();
  });

  test("renders Go back button", () => {
    const { ctx } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const btn = document.querySelector("[data-onboarding-back='true']");
    expect(btn).not.toBeNull();
  });

  test("status message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const status = document.querySelector<HTMLElement>(".onboarding-subtext")!;
    expect(status.hidden).toBe(true);
  });
});

describe("mountBiometricPrepScreen — Go back button", () => {
  test("clicking Go back dispatches BACK", () => {
    const { ctx, dispatched } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-back='true']")!;
    btn.click();
    expect(dispatched).toContain("BACK");
  });
});

describe("mountBiometricPrepScreen — Continue with successful enrollment", () => {
  test("dispatches BIOMETRIC_PREP_DONE when enrollBiometric succeeds", async () => {
    enrollBiometricMock.mockResolvedValue(ok(undefined));
    const { ctx, dispatched } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-prep-continue='true']")!;
    btn.click();
    await flush();
    expect(dispatched).toContain("BIOMETRIC_PREP_DONE");
  });

  test("Continue button is disabled while enrollment is in progress", async () => {
    let resolveEnroll!: (value: ReturnType<typeof ok>) => void;
    enrollBiometricMock.mockReturnValue(new Promise((res) => { resolveEnroll = res; }));
    const { ctx } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-prep-continue='true']")!;
    btn.click();
    await Promise.resolve();
    expect(btn.disabled).toBe(true);
    resolveEnroll(ok(undefined));
    await flush();
  });
});

describe("mountBiometricPrepScreen — Continue with user_cancelled error", () => {
  test("shows error message and re-enables Continue without entering fallback mode", async () => {
    enrollBiometricMock.mockResolvedValue(err("user_cancelled"));
    const { ctx } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-prep-continue='true']")!;
    btn.click();
    await flush();
    const status = document.querySelector<HTMLElement>(".onboarding-subtext")!;
    expect(status.hidden).toBe(false);
    expect(btn.disabled).toBe(false);
    // Button text should not have changed for user_cancelled (user can retry)
    expect(btn.textContent).toBe("Continue");
  });
});

describe("mountBiometricPrepScreen — Continue with prf_unavailable error", () => {
  test("enters fallback mode and changes Continue button text to 'Continue anyway'", async () => {
    enrollBiometricMock.mockResolvedValue(err("prf_unavailable"));
    const { ctx } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-prep-continue='true']")!;
    btn.click();
    await flush();
    expect(btn.textContent).toBe("Continue anyway");
    expect(btn.disabled).toBe(false);
  });

  test("clicking Continue anyway in fallback mode dispatches BIOMETRIC_PREP_DONE", async () => {
    enrollBiometricMock.mockResolvedValue(err("prf_unavailable"));
    const { ctx, dispatched } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-prep-continue='true']")!;
    btn.click();
    await flush();
    // Now in fallback mode — click again
    btn.click();
    await flush();
    expect(dispatched).toContain("BIOMETRIC_PREP_DONE");
  });
});

describe("mountBiometricPrepScreen — no master password in session", () => {
  test("shows error message and sets fallback mode when session has no master password", async () => {
    sessionGetMock.mockResolvedValue({});
    const { ctx } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-prep-continue='true']")!;
    btn.click();
    await flush();
    const status = document.querySelector<HTMLElement>(".onboarding-subtext")!;
    expect(status.hidden).toBe(false);
    expect(btn.textContent).toBe("Continue anyway");
  });
});

describe("mountBiometricPrepScreen — unmount", () => {
  test("unmount removes container from DOM", () => {
    const { ctx } = makeCtx();
    const handle = mountBiometricPrepScreen(ctx);
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='BIOMETRIC_PREP']")).toBeNull();
  });
});
