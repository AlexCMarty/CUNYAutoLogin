// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { mountCompleteDoneScreen } from "./completeDone";
import type { OnboardingScreenContext } from "./screenContext";

vi.mock("webextension-polyfill", () => ({ default: {} }));

const makeCtx = (): { ctx: OnboardingScreenContext; root: HTMLElement } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const ctx: OnboardingScreenContext = {
    doc: document,
    root,
    getSnapshot: () => ({ state: "COMPLETE_DONE", email: "", password: "", credentialError: null }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: vi.fn(),
  };
  return { ctx, root };
};

describe("mountCompleteDoneScreen", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders container with data-onboarding-screen='COMPLETE_DONE'", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    expect(root.querySelector("[data-onboarding-screen='COMPLETE_DONE']")).toBeTruthy();
  });

  test("renders completion headline", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    const h2 = root.querySelector("h2");
    expect(h2?.textContent).toBe("You're all set!");
  });

  test("renders body text", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    const body = root.querySelector("p");
    expect(body?.textContent).toBeTruthy();
  });

  test("no back button rendered", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    expect(root.querySelector("[data-onboarding-back='true']")).toBeNull();
  });

  test("no forward button rendered", () => {
    const { ctx, root } = makeCtx();
    mountCompleteDoneScreen(ctx);
    expect(root.querySelector("[data-onboarding-forward='true']")).toBeNull();
  });

  test("unmount removes the container from the DOM", () => {
    const { ctx, root } = makeCtx();
    const handle = mountCompleteDoneScreen(ctx);
    handle.unmount();
    expect(root.querySelector("[data-onboarding-screen='COMPLETE_DONE']")).toBeNull();
  });
});
