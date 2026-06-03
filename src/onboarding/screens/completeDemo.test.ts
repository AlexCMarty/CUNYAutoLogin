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
    getSnapshot: () => ({ state: "COMPLETE_DEMO", email: "", password: "", credentialError: null, advancedKeyFlow: false }),
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

  test("status narration appears on Show me (watch the real tab)", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    const status = root.querySelector<HTMLElement>("[data-onboarding-demo-status='true']")!;
    // The narration hint is shown immediately so the student watches the real tab.
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain("Watch the CUNY tab");
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

describe("mountCompleteDemoScreen — unmount", () => {
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

  test("a late signed_in after unmount does not reveal Done or dispatch DEMO_FINISHED", () => {
    const { ctx, dispatched } = makeCtx();
    const handle = mountCompleteDemoScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!;
    btn.click();
    handle.unmount();
    // A stray real event arriving after teardown must be ignored.
    handle.onMessage?.({ type: "ONBOARDING_LOGIN_PROGRESS", step: "signed_in" });
    expect(dispatched.filter((ev) => ev === "DEMO_FINISHED")).toHaveLength(0);
  });
});

describe("mountCompleteDemoScreen — animation steps", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("renders 4 demo rows, first labelled 'Opening CUNY Login'", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    const rows = root.querySelectorAll(".onboarding-demo-row");
    expect(rows.length).toBe(4);
    const texts = Array.from(
      root.querySelectorAll<HTMLElement>(".onboarding-demo-text")
    ).map((node) => node.textContent);
    expect(texts).toEqual([
      "Opening CUNY Login",
      "Filling in your email / password",
      "Filling in your login code",
      "Signed in",
    ]);
  });

  test("first step dot becomes active immediately after Show me click", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    // begin() activates bead 0 synchronously — no timer involved.
    const dots = root.querySelectorAll<HTMLElement>(".onboarding-demo-dot");
    expect(dots[0]?.dataset.active).toBe("true");
  });

  test("Show me keeps Skip available (escape hatch while the real login runs)", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    const skipBtn = root.querySelector<HTMLButtonElement>("[data-onboarding-demo-skip='true']")!;
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    expect(skipBtn.hidden).toBe(false);
  });

  test("no timer marks beads done — the demo waits for a real signed_in", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    vi.advanceTimersByTime(60_000);
    const dots = root.querySelectorAll<HTMLElement>(".onboarding-demo-dot");
    // Bead 0 stays active; nothing auto-advances or auto-completes.
    expect(dots[0]?.dataset.active).toBe("true");
    expect(dots[3]?.dataset.done).not.toBe("true");
    const doneBtn = root.querySelector<HTMLButtonElement>(".onboarding-actions button");
    expect(doneBtn?.textContent).not.toContain("Done");
  });

  test("a real signed_in reveals the status + Done and marks every dot done", () => {
    const { ctx, root } = makeCtx();
    const handle = mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    handle.onMessage?.({ type: "ONBOARDING_LOGIN_PROGRESS", step: "signed_in" });
    const status = root.querySelector<HTMLElement>("[data-onboarding-demo-status='true']")!;
    expect(status.hidden).toBe(false);
    const doneBtn = root.querySelector<HTMLButtonElement>("button");
    expect(doneBtn?.textContent).toContain("Done");
    root.querySelectorAll<HTMLElement>(".onboarding-demo-dot").forEach((dot) => {
      expect(dot.dataset.done).toBe("true");
      expect(dot.dataset.active).toBe("false");
    });
  });

  test("Done button after signed_in dispatches DEMO_FINISHED", () => {
    const { ctx, root, dispatched } = makeCtx();
    const handle = mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    handle.onMessage?.({ type: "ONBOARDING_LOGIN_PROGRESS", step: "signed_in" });
    const actions = root.querySelector<HTMLElement>(".onboarding-actions")!;
    const doneBtn = actions.querySelector<HTMLButtonElement>("button")!;
    doneBtn.click();
    expect(dispatched).toContain("DEMO_FINISHED");
  });
});

describe("mountCompleteDemoScreen — real progress events", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("onMessage is ignored before 'Show me' (no bead lights up early)", () => {
    const { ctx, root } = makeCtx();
    const handle = mountCompleteDemoScreen(ctx);
    handle.onMessage?.({ type: "ONBOARDING_LOGIN_PROGRESS", step: "code_done" });
    root.querySelectorAll<HTMLElement>(".onboarding-demo-dot").forEach((dot) => {
      expect(dot.dataset.active).not.toBe("true");
      expect(dot.dataset.done).not.toBe("true");
    });
  });

  test("after 'Show me', real events advance the beads (code bead waits for code_filling)", () => {
    const { ctx, root } = makeCtx();
    const handle = mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    handle.onMessage?.({ type: "ONBOARDING_LOGIN_PROGRESS", step: "credentials_filling" });
    let dots = root.querySelectorAll<HTMLElement>(".onboarding-demo-dot");
    expect(dots[1]?.dataset.active).toBe("true");
    expect(dots[2]?.dataset.active).not.toBe("true");
    handle.onMessage?.({ type: "ONBOARDING_LOGIN_PROGRESS", step: "code_filling" });
    dots = root.querySelectorAll<HTMLElement>(".onboarding-demo-dot");
    expect(dots[2]?.dataset.active).toBe("true");
  });

  test("a real 'signed_in' finishes the demo and reveals the status + Done", () => {
    const { ctx, root } = makeCtx();
    const handle = mountCompleteDemoScreen(ctx);
    root.querySelector<HTMLButtonElement>("[data-onboarding-demo-show='true']")!.click();
    handle.onMessage?.({ type: "ONBOARDING_LOGIN_PROGRESS", step: "signed_in" });
    const status = root.querySelector<HTMLElement>("[data-onboarding-demo-status='true']")!;
    expect(status.hidden).toBe(false);
    const doneBtn = root.querySelector<HTMLButtonElement>(".onboarding-actions button");
    expect(doneBtn?.textContent).toContain("Done");
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
