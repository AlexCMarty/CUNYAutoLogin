// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createOnboardingController } from "../controller";
import type { OnboardingScreenContext } from "./screenContext";
import {
  PASSWORD_BACK_SELECTOR,
  PASSWORD_FORWARD_SELECTOR,
  PASSWORD_INPUT_SELECTOR,
  PASSWORD_TOGGLE_SELECTOR,
  mountPasswordEntryScreen,
} from "./passwordEntry";

const setValue = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const buildCtx = (
  root: HTMLElement,
  initialPassword = ""
): {
  ctx: OnboardingScreenContext;
  dispatch: ReturnType<typeof vi.fn>;
  getSnapshot: OnboardingScreenContext["getSnapshot"];
} => {
  const controller = createOnboardingController({
    initialState: "PASSWORD_ENTRY",
    initialPassword,
  });
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
    getSnapshot: controller.getSnapshot,
  };
};

describe("mountPasswordEntryScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  test("renders the Brightspace-scoped label, subtext, and reassurance line", () => {
    const { ctx } = buildCtx(root);
    mountPasswordEntryScreen(ctx);

    expect(root.textContent).toContain("What's your Brightspace password?");
    expect(root.textContent).toContain(
      "The password you use to log in to Brightspace."
    );
    expect(root.textContent).toContain(
      "We'll save these on your device, encrypted, and use them right now to log you in so you can watch it work."
    );
  });

  test("input starts as type=password and Continue is disabled when empty", () => {
    const { ctx } = buildCtx(root);
    mountPasswordEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR);
    const forward = root.querySelector<HTMLButtonElement>(
      PASSWORD_FORWARD_SELECTOR
    );
    expect(input?.type).toBe("password");
    expect(forward?.disabled).toBe(true);
  });

  test("typing any non-empty value enables Continue without content validation", () => {
    const { ctx, getSnapshot } = buildCtx(root);
    mountPasswordEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR);
    const forward = root.querySelector<HTMLButtonElement>(
      PASSWORD_FORWARD_SELECTOR
    );
    if (!input || !forward) throw new Error("password elements missing");

    setValue(input, "x");
    expect(forward.disabled).toBe(false);
    expect(getSnapshot().password).toBe("x");
  });

  test("show/hide toggle flips input type and aria label", () => {
    const { ctx } = buildCtx(root);
    mountPasswordEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR);
    const toggle = root.querySelector<HTMLButtonElement>(
      PASSWORD_TOGGLE_SELECTOR
    );
    if (!input || !toggle) throw new Error("password elements missing");

    expect(input.type).toBe("password");
    expect(toggle.getAttribute("aria-label")).toBe("Show password");

    toggle.click();
    expect(input.type).toBe("text");
    expect(toggle.getAttribute("aria-label")).toBe("Hide password");

    toggle.click();
    expect(input.type).toBe("password");
    expect(toggle.getAttribute("aria-label")).toBe("Show password");
  });

  test("Continue click on non-empty input dispatches NEXT and keeps password in snapshot", () => {
    const { ctx, dispatch, getSnapshot } = buildCtx(root);
    mountPasswordEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR);
    const forward = root.querySelector<HTMLButtonElement>(
      PASSWORD_FORWARD_SELECTOR
    );
    if (!input || !forward) throw new Error("password elements missing");

    setValue(input, "s3cret");
    forward.click();
    expect(dispatch).toHaveBeenCalledWith("NEXT");
    expect(getSnapshot().password).toBe("s3cret");
  });

  test("Continue click on empty input is a no-op", () => {
    const { ctx, dispatch } = buildCtx(root);
    mountPasswordEntryScreen(ctx);

    const forward = root.querySelector<HTMLButtonElement>(
      PASSWORD_FORWARD_SELECTOR
    );
    forward?.click();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("Back click dispatches BACK", () => {
    const { ctx, dispatch } = buildCtx(root);
    mountPasswordEntryScreen(ctx);

    const back = root.querySelector<HTMLButtonElement>(PASSWORD_BACK_SELECTOR);
    back?.click();
    expect(dispatch).toHaveBeenCalledWith("BACK");
  });

  test("prefills the input with an existing in-memory snapshot password", () => {
    const { ctx } = buildCtx(root, "already-typed");
    mountPasswordEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR);
    expect(input?.value).toBe("already-typed");
  });
});
