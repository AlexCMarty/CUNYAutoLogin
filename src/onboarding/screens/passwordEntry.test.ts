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

// eslint-disable-next-line max-lines-per-function
describe("mountPasswordEntryScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  test("renders the label, subtext, and reassurance line", () => {
    const { ctx } = buildCtx(root);
    mountPasswordEntryScreen(ctx);

    expect(root.textContent).toContain("And your CUNY password.");
    expect(root.textContent).toContain(
      "The password you use to log in to Brightspace or CUNYFirst."
    );
    expect(root.textContent).toContain(
      "We'll save it on this computer and use it now to sign you in so you can watch it work."
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

  test("credential error is visible when snapshot.credentialError is non-null at mount", () => {
    const controller = createOnboardingController({
      initialState: "PASSWORD_ENTRY",
      initialCredentialError: { culprit: "password" },
    });
    const ctx: OnboardingScreenContext = {
      doc: document,
      root,
      dispatch: controller.dispatch,
      getSnapshot: controller.getSnapshot,
      setEmail: controller.setEmail,
      setPassword: controller.setPassword,
      setCredentialError: controller.setCredentialError,
    };
    mountPasswordEntryScreen(ctx);
    const errEl = root.querySelector<HTMLElement>("[data-onboarding-password-credential-error='true']")!;
    expect(errEl.hidden).toBe(false);
  });

  test("credential error is hidden when snapshot.credentialError is null at mount", () => {
    const { ctx } = buildCtx(root);
    mountPasswordEntryScreen(ctx);
    const errEl = root.querySelector<HTMLElement>("[data-onboarding-password-credential-error='true']")!;
    expect(errEl.hidden).toBe(true);
  });

  test("typing in input clears the visible credential error", () => {
    const controller = createOnboardingController({
      initialState: "PASSWORD_ENTRY",
      initialPassword: "old",
      initialCredentialError: { culprit: "password" },
    });
    const ctx: OnboardingScreenContext = {
      doc: document,
      root,
      dispatch: controller.dispatch,
      getSnapshot: controller.getSnapshot,
      setEmail: controller.setEmail,
      setPassword: controller.setPassword,
      setCredentialError: controller.setCredentialError,
    };
    mountPasswordEntryScreen(ctx);
    const input = root.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR)!;
    const errEl = root.querySelector<HTMLElement>("[data-onboarding-password-credential-error='true']")!;
    expect(errEl.hidden).toBe(false);
    setValue(input, "new-value");
    expect(errEl.hidden).toBe(true);
  });

  test("Enter key on non-empty input dispatches NEXT", () => {
    const { ctx, dispatch } = buildCtx(root);
    mountPasswordEntryScreen(ctx);
    const input = root.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR)!;
    setValue(input, "mypassword");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith("NEXT");
  });

  test("Enter key on empty input does not dispatch NEXT", () => {
    const { ctx, dispatch } = buildCtx(root);
    mountPasswordEntryScreen(ctx);
    const input = root.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR)!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("unmount removes the screen container from the DOM", () => {
    const { ctx } = buildCtx(root);
    const handle = mountPasswordEntryScreen(ctx);
    handle.unmount();
    expect(root.querySelector("[data-onboarding-screen='PASSWORD_ENTRY']")).toBeNull();
  });

  test("unmount detaches forward click handler", () => {
    const { ctx, dispatch } = buildCtx(root);
    const handle = mountPasswordEntryScreen(ctx);
    const input = root.querySelector<HTMLInputElement>(PASSWORD_INPUT_SELECTOR)!;
    const forward = root.querySelector<HTMLButtonElement>(PASSWORD_FORWARD_SELECTOR)!;
    setValue(input, "password123");
    handle.unmount();
    forward.click();
    expect(dispatch).not.toHaveBeenCalledWith("NEXT");
  });

  test("unmount detaches back click handler", () => {
    const { ctx, dispatch } = buildCtx(root);
    const handle = mountPasswordEntryScreen(ctx);
    const back = root.querySelector<HTMLButtonElement>(PASSWORD_BACK_SELECTOR)!;
    handle.unmount();
    back.click();
    expect(dispatch).not.toHaveBeenCalledWith("BACK");
  });

  test("credential error element has role='alert'", () => {
    const { ctx } = buildCtx(root);
    mountPasswordEntryScreen(ctx);
    const errEl = root.querySelector<HTMLElement>("[data-onboarding-password-credential-error='true']")!;
    expect(errEl.getAttribute("role")).toBe("alert");
  });

  test("credential error copy is pinned", () => {
    const controller = createOnboardingController({
      initialState: "PASSWORD_ENTRY",
      initialCredentialError: { culprit: "password" },
    });
    const ctx: OnboardingScreenContext = {
      doc: document,
      root,
      dispatch: controller.dispatch,
      getSnapshot: controller.getSnapshot,
      setEmail: controller.setEmail,
      setPassword: controller.setPassword,
      setCredentialError: controller.setCredentialError,
    };
    mountPasswordEntryScreen(ctx);
    const errEl = root.querySelector<HTMLElement>("[data-onboarding-password-credential-error='true']")!;
    expect(errEl.textContent).toContain("didn't work");
  });
});
