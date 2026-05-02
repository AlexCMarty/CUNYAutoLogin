// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mountBiometricPrepScreen } from "./biometricPrep";
import type { OnboardingScreenContext } from "./screenContext";

vi.mock("webextension-polyfill", () => ({ default: {} }));

// jsdom does not provide navigator.credentials; set up a stub before each test.
const setupCredentialsMock = (result: "resolve" | "reject"): void => {
  const mock =
    result === "resolve"
      ? vi.fn().mockResolvedValue({} as Credential)
      : vi.fn().mockRejectedValue(new DOMException("Not allowed", "NotAllowedError"));

  Object.defineProperty(navigator, "credentials", {
    value: { create: mock },
    configurable: true,
    writable: true,
  });
};

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

const flushPromises = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("mountBiometricPrepScreen — DOM structure", () => {
  let root: HTMLElement;

  beforeEach(() => {
    const setup = makeCtx();
    root = setup.root;
    mountBiometricPrepScreen(setup.ctx);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders container with data-onboarding-screen='BIOMETRIC_PREP'", () => {
    expect(root.querySelector("[data-onboarding-screen='BIOMETRIC_PREP']")).toBeTruthy();
  });

  test("renders back button with data-onboarding-back='true'", () => {
    expect(root.querySelector("[data-onboarding-back='true']")).toBeTruthy();
  });

  test("renders continue button", () => {
    expect(root.querySelector("[data-onboarding-biometric-prep-continue='true']")).toBeTruthy();
  });

  test("status message is hidden initially", () => {
    const msgs = root.querySelectorAll<HTMLElement>(".onboarding-subtext");
    for (const msgEl of msgs) {
      expect(msgEl.hidden).toBe(true);
    }
  });
});

describe("mountBiometricPrepScreen — back button", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("back button dispatches BACK", () => {
    const { ctx, root, dispatched } = makeCtx();
    mountBiometricPrepScreen(ctx);
    const backBtn = root.querySelector<HTMLButtonElement>("[data-onboarding-back='true']")!;
    backBtn.click();
    expect(dispatched).toContain("BACK");
  });
});

describe("mountBiometricPrepScreen — WebAuthn success", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("dispatches BIOMETRIC_PREP_DONE when credentials.create resolves", async () => {
    setupCredentialsMock("resolve");
    const { ctx, root, dispatched } = makeCtx();
    mountBiometricPrepScreen(ctx);

    const continueBtn = root.querySelector<HTMLButtonElement>("[data-onboarding-biometric-prep-continue='true']")!;
    continueBtn.click();
    await flushPromises();

    expect(dispatched).toContain("BIOMETRIC_PREP_DONE");
  });
});

describe("mountBiometricPrepScreen — WebAuthn failure fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("shows fallback message when credentials.create rejects", async () => {
    setupCredentialsMock("reject");
    const { ctx, root } = makeCtx();
    mountBiometricPrepScreen(ctx);

    const continueBtn = root.querySelector<HTMLButtonElement>("[data-onboarding-biometric-prep-continue='true']")!;
    continueBtn.click();
    await flushPromises();

    const statusMsg = root.querySelector<HTMLElement>(".onboarding-subtext")!;
    expect(statusMsg.hidden).toBe(false);
    expect(statusMsg.textContent).toContain("extension password");
    expect(statusMsg.hidden).toBe(false);
  });

  test("dispatches BIOMETRIC_PREP_DONE when user clicks Continue after fallback", async () => {
    setupCredentialsMock("reject");
    const { ctx, root, dispatched } = makeCtx();
    mountBiometricPrepScreen(ctx);

    const continueBtn = root.querySelector<HTMLButtonElement>("[data-onboarding-biometric-prep-continue='true']")!;
    continueBtn.click();
    await flushPromises();

    expect(continueBtn.textContent).toBe("Continue anyway");
    continueBtn.click();
    expect(dispatched).toContain("BIOMETRIC_PREP_DONE");
  });
});

describe("mountBiometricPrepScreen — unmount", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("removes the container from the DOM", () => {
    const { ctx, root } = makeCtx();
    const handle = mountBiometricPrepScreen(ctx);
    expect(root.querySelector("[data-onboarding-screen='BIOMETRIC_PREP']")).toBeTruthy();
    handle.unmount();
    expect(root.querySelector("[data-onboarding-screen='BIOMETRIC_PREP']")).toBeNull();
  });
});
