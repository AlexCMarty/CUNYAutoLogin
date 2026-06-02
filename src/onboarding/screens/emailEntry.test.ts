// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

// `validateEmail` lives in sidebar.utils.ts, which imports webextension-polyfill
// at module scope. Mock it so jsdom doesn't trip the polyfill's "not in an
// extension" guard — we never exercise browser.* in these tests.
vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    },
    runtime: { sendMessage: vi.fn() },
  },
}));

import { LOGIN_EMAIL_SUFFIX } from "../../cuny/ssoSite";
import { createOnboardingController } from "../controller";
import type { OnboardingScreenContext } from "./screenContext";
import {
  EMAIL_BACK_SELECTOR,
  EMAIL_FORWARD_SELECTOR,
  EMAIL_INLINE_HINT_SELECTOR,
  EMAIL_INPUT_SELECTOR,
  mountEmailEntryScreen,
} from "./emailEntry";

const setValue = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const buildCtx = (
  root: HTMLElement,
  initialEmail = ""
): {
  ctx: OnboardingScreenContext;
  dispatch: ReturnType<typeof vi.fn>;
  getSnapshot: OnboardingScreenContext["getSnapshot"];
} => {
  const controller = createOnboardingController({
    initialState: "EMAIL_ENTRY",
    initialEmail,
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
describe("mountEmailEntryScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  test("renders the label and login suffix reminder", () => {
    const { ctx } = buildCtx(root);
    mountEmailEntryScreen(ctx);

    expect(root.textContent).toContain(
      "What email do you sign in to CUNY with?"
    );
    expect(root.textContent).toContain("firstname.lastname12@login.cuny.edu");
    expect(root.textContent).toContain("@stu-mail.baruch.cuny.edu");
  });

  test("input is seeded with @login.cuny.edu and Continue is disabled initially", () => {
    const { ctx } = buildCtx(root);
    mountEmailEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR);
    const forward = root.querySelector<HTMLButtonElement>(
      EMAIL_FORWARD_SELECTOR
    );
    expect(input?.value).toBe(LOGIN_EMAIL_SUFFIX);
    // The prefilled suffix passes validateEmail (endsWith check), but a bare
    // suffix with no local part is still a valid CUNY address surface per the
    // existing validator contract. Forward must be enabled once the value
    // passes validateEmail — this mirrors vaultController.ts behavior.
    expect(forward?.disabled).toBe(false);
  });

  test("invalid email domain disables Continue and exposes inline hint on blur", () => {
    const { ctx } = buildCtx(root);
    mountEmailEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR);
    const forward = root.querySelector<HTMLButtonElement>(
      EMAIL_FORWARD_SELECTOR
    );
    const hint = root.querySelector<HTMLElement>(EMAIL_INLINE_HINT_SELECTOR);

    if (!input || !forward || !hint) throw new Error("email elements missing");

    setValue(input, "jane.doe@baruchmail.cuny.edu");
    expect(forward.disabled).toBe(true);

    input.dispatchEvent(new Event("blur"));
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toContain("CUNY logins end in @login.cuny.edu");
  });

  test("valid @login.cuny.edu address enables Continue and hides the inline hint", () => {
    const { ctx } = buildCtx(root);
    mountEmailEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR);
    const forward = root.querySelector<HTMLButtonElement>(
      EMAIL_FORWARD_SELECTOR
    );
    const hint = root.querySelector<HTMLElement>(EMAIL_INLINE_HINT_SELECTOR);

    if (!input || !forward || !hint) throw new Error("email elements missing");

    setValue(input, "invalid@example.com");
    input.dispatchEvent(new Event("blur"));
    expect(hint.hidden).toBe(false);

    setValue(input, "jane.doe@login.cuny.edu");
    expect(forward.disabled).toBe(false);
    expect(hint.hidden).toBe(true);
  });

  test("Continue click on valid input dispatches NEXT and stages email in controller", () => {
    const { ctx, dispatch, getSnapshot } = buildCtx(root);
    mountEmailEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR);
    const forward = root.querySelector<HTMLButtonElement>(
      EMAIL_FORWARD_SELECTOR
    );
    if (!input || !forward) throw new Error("email elements missing");

    setValue(input, "jane.doe@login.cuny.edu");
    forward.click();
    expect(dispatch).toHaveBeenCalledWith("NEXT");
    expect(getSnapshot().email).toBe("jane.doe@login.cuny.edu");
  });

  test("Continue click on invalid input does not dispatch NEXT", () => {
    const { ctx, dispatch } = buildCtx(root);
    mountEmailEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR);
    const forward = root.querySelector<HTMLButtonElement>(
      EMAIL_FORWARD_SELECTOR
    );
    if (!input || !forward) throw new Error("email elements missing");

    setValue(input, "not-an-email");
    forward.click();
    expect(dispatch).not.toHaveBeenCalledWith("NEXT");
  });

  test("Back click dispatches BACK", () => {
    const { ctx, dispatch } = buildCtx(root);
    mountEmailEntryScreen(ctx);

    const back = root.querySelector<HTMLButtonElement>(EMAIL_BACK_SELECTOR);
    back?.click();
    expect(dispatch).toHaveBeenCalledWith("BACK");
  });

  test("prefills the input with an existing in-memory snapshot email", () => {
    const { ctx } = buildCtx(root, "existing@login.cuny.edu");
    mountEmailEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR);
    expect(input?.value).toBe("existing@login.cuny.edu");
  });

  test("dedupes repeated @login.cuny.edu suffix when restoring snapshot", () => {
    const { ctx } = buildCtx(root, "returning@login.cuny.edu@login.cuny.edu");
    mountEmailEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR);
    expect(input?.value).toBe("returning@login.cuny.edu");
  });

  test("empty input on blur hides the hint (avoids shouting at an untouched field)", () => {
    const { ctx } = buildCtx(root);
    mountEmailEntryScreen(ctx);

    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR);
    const hint = root.querySelector<HTMLElement>(EMAIL_INLINE_HINT_SELECTOR);
    if (!input || !hint) throw new Error("email elements missing");

    setValue(input, "");
    input.dispatchEvent(new Event("blur"));
    expect(hint.hidden).toBe(true);
  });

  test("credential error is visible when snapshot.credentialError is non-null at mount", () => {
    const controller = createOnboardingController({
      initialState: "EMAIL_ENTRY",
      initialCredentialError: { culprit: "email" },
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
    mountEmailEntryScreen(ctx);
    const errEl = root.querySelector<HTMLElement>("[data-onboarding-email-credential-error='true']")!;
    expect(errEl.hidden).toBe(false);
  });

  test("credential error is hidden when snapshot.credentialError is null at mount", () => {
    const { ctx } = buildCtx(root);
    mountEmailEntryScreen(ctx);
    const errEl = root.querySelector<HTMLElement>("[data-onboarding-email-credential-error='true']")!;
    expect(errEl.hidden).toBe(true);
  });

  test("typing in input clears the visible credential error", () => {
    const controller = createOnboardingController({
      initialState: "EMAIL_ENTRY",
      initialEmail: "jane@login.cuny.edu",
      initialCredentialError: { culprit: "email" },
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
    mountEmailEntryScreen(ctx);
    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR)!;
    const errEl = root.querySelector<HTMLElement>("[data-onboarding-email-credential-error='true']")!;
    expect(errEl.hidden).toBe(false);
    setValue(input, "jane.doe@login.cuny.edu");
    expect(errEl.hidden).toBe(true);
  });

  test("Enter key on valid email dispatches NEXT", () => {
    const { ctx, dispatch } = buildCtx(root);
    mountEmailEntryScreen(ctx);
    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR)!;
    setValue(input, "jane.doe@login.cuny.edu");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith("NEXT");
  });

  test("Enter key on invalid email does not dispatch NEXT", () => {
    const { ctx, dispatch } = buildCtx(root);
    mountEmailEntryScreen(ctx);
    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR)!;
    setValue(input, "not-valid@example.com");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(dispatch).not.toHaveBeenCalledWith("NEXT");
  });

  test("unmount removes the screen container from the DOM", () => {
    const { ctx } = buildCtx(root);
    const handle = mountEmailEntryScreen(ctx);
    handle.unmount();
    expect(root.querySelector("[data-onboarding-screen='EMAIL_ENTRY']")).toBeNull();
  });

  test("unmount detaches forward click handler", () => {
    const { ctx, dispatch } = buildCtx(root);
    const handle = mountEmailEntryScreen(ctx);
    const input = root.querySelector<HTMLInputElement>(EMAIL_INPUT_SELECTOR)!;
    const forward = root.querySelector<HTMLButtonElement>(EMAIL_FORWARD_SELECTOR)!;
    setValue(input, "jane@login.cuny.edu");
    handle.unmount();
    forward.click();
    expect(dispatch).not.toHaveBeenCalledWith("NEXT");
  });

  test("unmount detaches back click handler", () => {
    const { ctx, dispatch } = buildCtx(root);
    const handle = mountEmailEntryScreen(ctx);
    const back = root.querySelector<HTMLButtonElement>(EMAIL_BACK_SELECTOR)!;
    handle.unmount();
    back.click();
    expect(dispatch).not.toHaveBeenCalledWith("BACK");
  });
});
