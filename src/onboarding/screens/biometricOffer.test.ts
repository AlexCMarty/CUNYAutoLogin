// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mountBiometricOfferScreen } from "./biometricOffer";
import type { OnboardingScreenContext } from "./screenContext";

vi.mock("webextension-polyfill", () => ({ default: {} }));

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

const flushPromises = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("mountBiometricOfferScreen — platform authenticator unavailable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("dispatches BIOMETRIC_DECLINED immediately when API returns false", async () => {
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(false),
      },
      configurable: true,
      writable: true,
    });
    const { ctx, dispatched } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flushPromises();
    expect(dispatched).toEqual(["BIOMETRIC_DECLINED"]);
  });

  test("dispatches BIOMETRIC_DECLINED when API throws", async () => {
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockRejectedValue(new Error("unavailable")),
      },
      configurable: true,
      writable: true,
    });
    const { ctx, dispatched } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flushPromises();
    expect(dispatched).toEqual(["BIOMETRIC_DECLINED"]);
  });

  test("dispatches BIOMETRIC_DECLINED when PublicKeyCredential is undefined", async () => {
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const { ctx, dispatched } = makeCtx();
    mountBiometricOfferScreen(ctx);
    await flushPromises();
    expect(dispatched).toEqual(["BIOMETRIC_DECLINED"]);
  });
});

describe("mountBiometricOfferScreen — platform authenticator available", () => {
  let root: HTMLElement;
  let dispatched: string[];

  beforeEach(async () => {
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      },
      configurable: true,
      writable: true,
    });
    const setup = makeCtx();
    root = setup.root;
    dispatched = setup.dispatched;
    mountBiometricOfferScreen(setup.ctx);
    await flushPromises();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("renders container with data-onboarding-screen='BIOMETRIC_OFFER'", () => {
    expect(root.querySelector("[data-onboarding-screen='BIOMETRIC_OFFER']")).toBeTruthy();
  });

  test("renders 'Use Face ID / Fingerprint' button", () => {
    expect(root.querySelector("[data-onboarding-biometric-use='true']")).toBeTruthy();
  });

  test("renders 'Type my password each time' button", () => {
    expect(root.querySelector("[data-onboarding-biometric-skip='true']")).toBeTruthy();
  });

  test("clicking use button dispatches BIOMETRIC_ACCEPTED", () => {
    const btn = root.querySelector<HTMLButtonElement>("[data-onboarding-biometric-use='true']")!;
    btn.click();
    expect(dispatched).toContain("BIOMETRIC_ACCEPTED");
  });

  test("clicking skip button dispatches BIOMETRIC_DECLINED", () => {
    const btn = root.querySelector<HTMLButtonElement>("[data-onboarding-biometric-skip='true']")!;
    btn.click();
    expect(dispatched).toContain("BIOMETRIC_DECLINED");
  });
});

describe("mountBiometricOfferScreen — unmount", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("removes the container from the DOM", async () => {
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      },
      configurable: true,
      writable: true,
    });
    const { ctx, root } = makeCtx();
    const handle = mountBiometricOfferScreen(ctx);
    await flushPromises();
    expect(root.querySelector("[data-onboarding-screen='BIOMETRIC_OFFER']")).toBeTruthy();
    handle.unmount();
    expect(root.querySelector("[data-onboarding-screen='BIOMETRIC_OFFER']")).toBeNull();
  });
});
