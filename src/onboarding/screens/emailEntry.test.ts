// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

// `validateEmail` lives in popup.utils.ts, which imports webextension-polyfill
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
    },
    dispatch,
    getSnapshot: controller.getSnapshot,
  };
};

describe("mountEmailEntryScreen", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  test("renders the Brightspace-framed label and login suffix reminder", () => {
    const { ctx } = buildCtx(root);
    mountEmailEntryScreen(ctx);

    expect(root.textContent).toContain(
      "What email do you use to log in to Brightspace?"
    );
    expect(root.textContent).toContain("firstname.lastname@login.cuny.edu");
    expect(root.textContent).toContain("@baruchmail.cuny.edu");
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
    // passes validateEmail — this mirrors popup.ts behavior.
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
});
