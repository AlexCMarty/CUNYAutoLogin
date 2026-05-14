// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { mountBiometricOfferScreen } from "./biometricOffer";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement; dispatched: string[] } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const dispatched: string[] = [];
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "BIOMETRIC_OFFER", email: "", password: "", credentialError: null }),
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
};

beforeEach(() => {
  document.body.innerHTML = "";
  // Reset any PublicKeyCredential mock between tests
  vi.restoreAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("mountBiometricOfferScreen — platform authenticator unavailable", () => {
  test("dispatches BIOMETRIC_DECLINED when PublicKeyCredential is undefined", async () => {
    // PublicKeyCredential is not defined in jsdom by default
    const { ctx, dispatched } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    expect(dispatched).toContain("BIOMETRIC_DECLINED");
  });
});

describe("mountBiometricOfferScreen — platform authenticator available", () => {
  beforeEach(() => {
    // Stub PublicKeyCredential as available
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Clean up the stub
    try {
      delete (globalThis as Record<string, unknown>)["PublicKeyCredential"];
    } catch {
      // Non-configurable in some environments — leave it
    }
  });

  test("renders container with data-onboarding-screen='BIOMETRIC_OFFER'", async () => {
    const { ctx } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    expect(document.querySelector("[data-onboarding-screen='BIOMETRIC_OFFER']")).not.toBeNull();
  });

  test("renders Use Face ID / Fingerprint button", async () => {
    const { ctx } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    const useBtn = document.querySelector("[data-onboarding-biometric-use='true']");
    expect(useBtn).not.toBeNull();
  });

  test("renders Type my password each time button", async () => {
    const { ctx } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    const skipBtn = document.querySelector("[data-onboarding-biometric-skip='true']");
    expect(skipBtn).not.toBeNull();
  });

  test("clicking Use dispatches BIOMETRIC_ACCEPTED", async () => {
    const { ctx, dispatched } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    const useBtn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-use='true']")!;
    useBtn.click();
    expect(dispatched).toContain("BIOMETRIC_ACCEPTED");
  });

  test("clicking Skip dispatches BIOMETRIC_DECLINED", async () => {
    const { ctx, dispatched } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    const skipBtn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-skip='true']")!;
    skipBtn.click();
    expect(dispatched).toContain("BIOMETRIC_DECLINED");
  });
});

describe("mountBiometricOfferScreen — unmount", () => {
  test("unmount removes container from DOM", async () => {
    const { ctx } = makeCtx();
    const handle = mountBiometricOfferScreen(ctx);
    await flush();
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='BIOMETRIC_OFFER']")).toBeNull();
  });
});
