// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mountCompleteDemoScreen } from "./completeDemo";
import type { OnboardingScreenContext } from "./screenContext";
import { BRIGHTSPACE_HOME_URL } from "../../cuny/ssoSite";

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

  test("Show me sends ONBOARDING_REOPEN_CUNY_TAB to Brightspace home", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_REOPEN_CUNY_TAB",
        url: BRIGHTSPACE_HOME_URL,
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

  test("timers cleared on unmount do not fire after removal", () => {
    const { ctx, dispatched } = makeCtx();
    const handle = mountCompleteDemoScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!;
    btn.click();
    // Unmount before timers fire
    handle.unmount();
    // Advance all timers — nothing should fire or throw
    vi.runAllTimers();
    expect(dispatched.filter((ev) => ev === "DEMO_FINISHED")).toHaveLength(0);
  });
});

describe("mountCompleteDemoScreen — animation steps", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("renders 5 demo rows (one per DEMO_STEPS entry)", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    const rows = root.querySelectorAll(".onboarding-demo-row");
    expect(rows.length).toBe(5);
  });

  test("first step dot becomes active immediately after Show me click", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    // The first setTimeout fires at stepIdx * 1500ms = 0ms — advance 0ms
    vi.advanceTimersByTime(0);
    const dots = root.querySelectorAll<HTMLElement>(".onboarding-demo-dot");
    expect(dots[0]?.dataset.active).toBe("true");
  });

  test("Show me hides Skip button", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    const skipBtn = root.querySelector<HTMLButtonElement>("[data-onboarding-demo-skip='true']")!;
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    expect(skipBtn.hidden).toBe(true);
  });

  test("status element revealed and Done button appears after all steps animate", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    // 5 steps × 1500ms + 1 finish timer at 5 × 1500ms
    vi.advanceTimersByTime(5 * 1500);
    const status = root.querySelector<HTMLElement>("[data-onboarding-demo-status='true']")!;
    expect(status.hidden).toBe(false);
    const doneBtn = root.querySelector<HTMLButtonElement>("button");
    expect(doneBtn?.textContent).toContain("Done");
  });

  test("Done button after animation dispatches DEMO_FINISHED", () => {
    const { ctx, root, dispatched } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    vi.advanceTimersByTime(5 * 1500);
    // The done button replaces the show/skip buttons
    const actions = root.querySelector<HTMLElement>(".onboarding-actions")!;
    const doneBtn = actions.querySelector<HTMLButtonElement>("button")!;
    doneBtn.click();
    expect(dispatched).toContain("DEMO_FINISHED");
  });

  test("all dots are marked done after animation completes", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    vi.advanceTimersByTime(5 * 1500);
    const dots = root.querySelectorAll<HTMLElement>(".onboarding-demo-dot");
    dots.forEach((dot) => {
      expect(dot.dataset.done).toBe("true");
      expect(dot.dataset.active).toBe("false");
    });
  });
});

describe("mountCompleteDemoScreen — copy strings", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("body copy is pinned", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    const body = root.querySelector(".onboarding-body");
    expect(body?.textContent).toContain("Next time you need to sign in to CUNY");
  });
});
