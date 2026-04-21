// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createOnboardingController } from "../controller";
import type { OnboardingScreenContext } from "./screenContext";
import {
  WELCOME_CTA_SELECTOR,
  WELCOME_REASSURANCE_SELECTOR,
  mountWelcomeScreen,
} from "./welcome";

const buildCtx = (root: HTMLElement): {
  ctx: OnboardingScreenContext;
  dispatch: ReturnType<typeof vi.fn>;
} => {
  const controller = createOnboardingController();
  const dispatch = vi.fn<(event: Parameters<typeof controller.dispatch>[0]) => void>(
    controller.dispatch
  );
  return {
    ctx: {
      doc: document,
      root,
      dispatch,
      getSnapshot: controller.getSnapshot,
      setEmail: controller.setEmail,
      setPassword: controller.setPassword,
      setCredentialError: controller.setCredentialError,
    },
    dispatch,
  };
};

describe("mountWelcomeScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  test("renders the locked headline, body, reassurance, and CTA copy", () => {
    const { ctx } = buildCtx(root);
    mountWelcomeScreen(ctx);

    expect(root.querySelector("h2")?.textContent).toBe(
      "CUNYAutoLogin fills in your login and generates your verification codes for you."
    );
    expect(root.textContent).toContain("Setup takes about 5 minutes.");
    expect(root.querySelector(WELCOME_REASSURANCE_SELECTOR)?.textContent).toContain(
      "saved only on this device, encrypted"
    );
    expect(root.querySelector(WELCOME_CTA_SELECTOR)?.textContent).toBe("Let's go");
    expect(root.textContent).toContain(
      "An independent open-source project. Not affiliated with CUNY."
    );
  });

  test("does not include an exclamation point in body copy", () => {
    const { ctx } = buildCtx(root);
    mountWelcomeScreen(ctx);
    const body = root.textContent ?? "";
    expect(body.includes("!")).toBe(false);
  });

  test("clicking Let's go dispatches NEXT", () => {
    const { ctx, dispatch } = buildCtx(root);
    mountWelcomeScreen(ctx);

    const cta = root.querySelector<HTMLButtonElement>(WELCOME_CTA_SELECTOR);
    cta?.click();
    expect(dispatch).toHaveBeenCalledWith("NEXT");
  });

  test("unmount removes the screen and detaches the click handler", () => {
    const { ctx, dispatch } = buildCtx(root);
    const handle = mountWelcomeScreen(ctx);

    const cta = root.querySelector<HTMLButtonElement>(WELCOME_CTA_SELECTOR);
    handle.unmount();
    cta?.click();
    expect(dispatch).not.toHaveBeenCalled();
    expect(root.querySelector(WELCOME_CTA_SELECTOR)).toBeNull();
  });
});
