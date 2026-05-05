// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mountCompleteDemoScreen } from "./completeDemo";
import type { OnboardingScreenContext } from "./screenContext";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

// Import the mock after vi.mock so we can access the spy
import browser from "webextension-polyfill";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement; dispatched: string[] } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const dispatched: string[] = [];
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "COMPLETE_DEMO", email: "", password: "", credentialError: null }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: (event) => { dispatched.push(event); },
  };
  return { ctx, root, dispatched };
};

describe("mountCompleteDemoScreen — DOM structure", () => {
  let root: HTMLElement;

  beforeEach(() => {
    const setup = makeCtx();
    root = setup.root;
    mountCompleteDemoScreen(setup.ctx);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("renders container with data-onboarding-screen='COMPLETE_DEMO'", () => {
    expect(root.querySelector("[data-onboarding-screen='COMPLETE_DEMO']")).toBeTruthy();
  });

  test("renders headline", () => {
    const h2 = root.querySelector("h2");
    expect(h2?.textContent).toBe("You're all set.");
  });

  test("renders Show me button", () => {
    expect(root.querySelector("[data-onboarding-demo-show='true']")).toBeTruthy();
  });

  test("renders Skip button", () => {
    expect(root.querySelector("[data-onboarding-demo-skip='true']")).toBeTruthy();
  });

  test("status element is hidden initially", () => {
    const status = root.querySelector<HTMLElement>("[data-onboarding-demo-status='true']")!;
    expect(status).toBeTruthy();
    expect(status.hidden).toBe(true);
  });
});

describe("mountCompleteDemoScreen — Skip", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("Skip button dispatches DEMO_FINISHED", () => {
    const { ctx, root, dispatched } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-skip='true']")!.click();
    expect(dispatched).toContain("DEMO_FINISHED");
  });
});

describe("mountCompleteDemoScreen — Show me", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("Show me sends ONBOARDING_REOPEN_CUNY_TAB to the OAA login entry URL", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_REOPEN_CUNY_TAB",
        url: "https://ssologin.cuny.edu/oaa/rui",
      })
    );
    expect(vi.mocked(browser.runtime.sendMessage)).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "LOGOUT_CUNY_SESSIONS" })
    );
  });

  test("status element is hidden until animation completes", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    const status = root.querySelector<HTMLElement>("[data-onboarding-demo-status='true']")!;
    // Status is revealed only after all steps animate; immediately after click it stays hidden.
    expect(status.hidden).toBe(true);
  });

  test("Show me dispatches DEMO_REQUESTED", () => {
    const { ctx, root, dispatched } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    expect(dispatched).toContain("DEMO_REQUESTED");
  });

  test("Show me disables the Show me button", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    const btn = root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!;
    btn.click();
    expect(btn.disabled).toBe(true);
  });
});

describe("mountCompleteDemoScreen — unmount clears timers", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("unmount removes the container from the DOM", () => {
    const { ctx, root } = makeCtx();
    const handle = mountCompleteDemoScreen(ctx);
    handle.unmount();
    expect(root.querySelector("[data-onboarding-screen='COMPLETE_DEMO']")).toBeNull();
  });
});
