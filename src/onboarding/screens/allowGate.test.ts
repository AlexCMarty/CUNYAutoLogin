// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(message: unknown) => Promise<unknown>>(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { sendMessage: sendMessageMock },
  },
}));

import { mountAllowGateScreen, ALLOW_GATE_SCREEN_SELECTOR, ALLOW_GATE_BACK_SELECTOR } from "./allowGate";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement; dispatched: string[] } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const dispatched: string[] = [];
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "ALLOW_GATE", email: "", password: "", credentialError: null }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: (event) => { dispatched.push(event); },
  };
  return { ctx, root, dispatched };
};

beforeEach(() => {
  sendMessageMock.mockReset();
  sendMessageMock.mockResolvedValue(undefined);
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("constants", () => {
  test("ALLOW_GATE_SCREEN_SELECTOR targets data-onboarding-screen='ALLOW_GATE'", () => {
    expect(ALLOW_GATE_SCREEN_SELECTOR).toContain("ALLOW_GATE");
  });

  test("ALLOW_GATE_BACK_SELECTOR targets the back button", () => {
    expect(ALLOW_GATE_BACK_SELECTOR).toContain("allow-back");
  });
});

describe("mountAllowGateScreen — DOM structure", () => {
  test("renders container matching ALLOW_GATE_SCREEN_SELECTOR", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    expect(document.querySelector(ALLOW_GATE_SCREEN_SELECTOR)).not.toBeNull();
  });

  test("renders headline", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toContain("tap");
  });

  test("renders body copy", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    expect(document.body.textContent).toContain("Allow");
  });

  test("renders Back button matching ALLOW_GATE_BACK_SELECTOR", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    expect(document.querySelector(ALLOW_GATE_BACK_SELECTOR)).not.toBeNull();
  });

  test("recovery message is hidden initially", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const recovery = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(recovery.hidden).toBe(true);
  });
});

describe("mountAllowGateScreen — sendMessage on mount", () => {
  test("sends ONBOARDING_OVERLAY_COMMAND show on mount", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
      })
    );
  });
});

describe("mountAllowGateScreen — interactions", () => {
  test("clicking Back dispatches BACK", () => {
    const { ctx, dispatched } = makeCtx();
    mountAllowGateScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>(ALLOW_GATE_BACK_SELECTOR)!;
    btn.click();
    expect(dispatched).toContain("BACK");
  });

  test("unmount removes the container from DOM", () => {
    const { ctx } = makeCtx();
    const handle = mountAllowGateScreen(ctx);
    handle.unmount();
    expect(document.querySelector(ALLOW_GATE_SCREEN_SELECTOR)).toBeNull();
  });

  test("unmount sends ONBOARDING_OVERLAY_COMMAND hide", () => {
    const { ctx } = makeCtx();
    const handle = mountAllowGateScreen(ctx);
    sendMessageMock.mockClear();
    handle.unmount();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "hide",
      })
    );
  });

  test("unmount detaches back button click handler", () => {
    const { ctx, dispatched } = makeCtx();
    const handle = mountAllowGateScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>(ALLOW_GATE_BACK_SELECTOR)!;
    handle.unmount();
    btn.click();
    expect(dispatched).not.toContain("BACK");
  });
});

describe("mountAllowGateScreen — copy strings", () => {
  test("headline copy is pinned", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const h2 = document.querySelector<HTMLElement>("h2")!;
    expect(h2.textContent).toBe("One tap on the CUNY tab, then we keep going.");
  });

  test("body copy is pinned", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const body = document.querySelector<HTMLElement>(".onboarding-body")!;
    expect(body.textContent).toBe("Click Allow on the CUNY tab to continue.");
  });

  test("directional line copy is pinned", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const directional = document.querySelector<HTMLElement>(".onboarding-directional")!;
    expect(directional.textContent).toBe("We've highlighted the button on the CUNY tab.");
  });

  test("waiting label copy mentions the CUNY tab", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const waiting = document.querySelector<HTMLElement>(".onboarding-waiting-label")!;
    expect(waiting.textContent).toContain("Waiting for you to finish on the CUNY tab");
  });

  test("recovery message copy mentions the Allow button", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const recovery = document.querySelector<HTMLElement>("[data-onboarding-recovery-message='true']")!;
    expect(recovery.textContent).toContain("Allow button");
  });

  test("back button label is 'Back'", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>(ALLOW_GATE_BACK_SELECTOR)!;
    expect(btn.textContent).toBe("Back");
  });
});

describe("mountAllowGateScreen — pulse element", () => {
  test("renders pulse wrap with aria-hidden", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const wrap = document.querySelector<HTMLElement>(".onboarding-pulse-wrap")!;
    expect(wrap.getAttribute("aria-hidden")).toBe("true");
  });

  test("renders pulse span inside pulse wrap", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    const pulse = document.querySelector(".onboarding-pulse-wrap .onboarding-pulse");
    expect(pulse).not.toBeNull();
  });
});

describe("mountAllowGateScreen — overlay send on show command", () => {
  test("show overlay includes targetSpec and tooltipText", () => {
    const { ctx } = makeCtx();
    mountAllowGateScreen(ctx);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: expect.objectContaining({ type: "css" }),
        tooltipText: expect.any(String),
        stepIndex: expect.any(Number),
        stepTotal: expect.any(Number),
      })
    );
  });
});
