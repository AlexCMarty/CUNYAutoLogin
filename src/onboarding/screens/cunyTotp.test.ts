// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { mountCunyTotpScreen } from "./cunyTotp";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement; dispatched: string[] } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const dispatched: string[] = [];
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "CUNY_TOTP", email: "", password: "", credentialError: null }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: (event) => { dispatched.push(event); },
  };
  return { ctx, root, dispatched };
};

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountCunyTotpScreen — DOM structure", () => {
  test("renders container with data-onboarding-screen='CUNY_TOTP'", () => {
    const { ctx } = makeCtx();
    mountCunyTotpScreen(ctx);
    expect(document.querySelector("[data-onboarding-screen='CUNY_TOTP']")).not.toBeNull();
  });

  test("renders headline", () => {
    const { ctx } = makeCtx();
    mountCunyTotpScreen(ctx);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toBe("Finish signing in on your phone.");
  });

  test("renders body copy", () => {
    const { ctx } = makeCtx();
    mountCunyTotpScreen(ctx);
    expect(document.body.textContent).toContain("six-digit code");
  });

  test("renders Back button", () => {
    const { ctx } = makeCtx();
    mountCunyTotpScreen(ctx);
    const btn = document.querySelector("[data-onboarding-cuny-totp-back='true']");
    expect(btn).not.toBeNull();
  });

  test("renders step cards for the 3 steps", () => {
    const { ctx } = makeCtx();
    mountCunyTotpScreen(ctx);
    const rows = document.querySelectorAll(".onboarding-step-row");
    expect(rows.length).toBe(3);
  });
});

describe("mountCunyTotpScreen — interactions", () => {
  test("clicking Back dispatches BACK", () => {
    const { ctx, dispatched } = makeCtx();
    mountCunyTotpScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-cuny-totp-back='true']")!;
    btn.click();
    expect(dispatched).toContain("BACK");
  });

  test("unmount removes the container from DOM", () => {
    const { ctx } = makeCtx();
    const handle = mountCunyTotpScreen(ctx);
    handle.unmount();
    expect(document.querySelector("[data-onboarding-screen='CUNY_TOTP']")).toBeNull();
  });

  test("unmount detaches the back button click handler", () => {
    const { ctx, dispatched } = makeCtx();
    const handle = mountCunyTotpScreen(ctx);
    const btn = document.querySelector<HTMLButtonElement>("[data-onboarding-cuny-totp-back='true']")!;
    handle.unmount();
    btn.click();
    expect(dispatched).not.toContain("BACK");
  });
});
