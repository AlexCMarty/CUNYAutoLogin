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

  test("unmount before async completes still removes container", () => {
    // Unmount synchronously, before the IIFE resolves
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      },
      writable: true,
      configurable: true,
    });
    const { ctx } = makeCtx();
    const handle = mountBiometricOfferScreen(ctx);
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='BIOMETRIC_OFFER']")).toBeNull();
  });
});

describe("mountBiometricOfferScreen — copy strings when authenticator available", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    try {
      delete (globalThis as Record<string, unknown>)["PublicKeyCredential"];
    } catch {
      // Non-configurable — leave
    }
  });

  test("headline copy is pinned", async () => {
    const { ctx } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toBe("Unlock faster with Face ID or fingerprint.");
  });

  test("body copy mentions biometrics", async () => {
    const { ctx } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    const body = document.querySelector(".onboarding-body");
    expect(body?.textContent).toContain("biometrics");
  });

  test("Use button text is pinned", async () => {
    const { ctx } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-use='true']")!;
    expect(btn.textContent).toBe("Use Face ID / Fingerprint");
  });

  test("Skip button text is pinned", async () => {
    const { ctx } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-biometric-skip='true']")!;
    expect(btn.textContent).toBe("Type my password each time");
  });
});

describe("mountBiometricOfferScreen — isUserVerifyingPlatformAuthenticatorAvailable rejects", () => {
  test("dispatches BIOMETRIC_DECLINED when the availability check throws", async () => {
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockRejectedValue(new Error("not allowed")),
      },
      writable: true,
      configurable: true,
    });
    const { ctx, dispatched } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flush();
    expect(dispatched).toContain("BIOMETRIC_DECLINED");
    try {
      delete (globalThis as Record<string, unknown>)["PublicKeyCredential"];
    } catch {
      // Non-configurable — leave
    }
  });
});
