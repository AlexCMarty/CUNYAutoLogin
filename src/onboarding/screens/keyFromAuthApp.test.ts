// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: { session: { set: vi.fn().mockResolvedValue(undefined) } },
  },
}));

import browser from "webextension-polyfill";
import { mountKeyFromAuthAppScreen } from "./keyFromAuthApp";
import { PENDING_TOTP_SECRET_SESSION_KEY } from "../../cuny/ssoSite";
import type { OnboardingScreenContext } from "./screenContext";

const sessionSet = browser.storage.session.set as ReturnType<typeof vi.fn>;

const makeCtx = (): OnboardingScreenContext & { dispatch: ReturnType<typeof vi.fn> } => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return {
    doc: document,
    root,
    getSnapshot: () => ({
      state: "KEY_FROM_AUTH_APP",
      email: "",
      password: "",
      credentialError: null,
      advancedKeyFlow: false,
    }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: vi.fn<OnboardingScreenContext["dispatch"]>(),
  };
};

const keyInput = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>("[data-onboarding-key-input='true']")!;
const confirmBtn = (): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>("[data-onboarding-key-confirm='true']")!;
const backBtn = (): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>("[data-onboarding-key-back='true']")!;

const typeKey = (value: string): void => {
  const input = keyInput();
  input.value = value;
  input.dispatchEvent(new Event("input"));
};

afterEach(() => {
  document.body.innerHTML = "";
  sessionSet.mockClear();
});

describe("mountKeyFromAuthAppScreen", () => {
  test("renders the KEY_FROM_AUTH_APP container", () => {
    mountKeyFromAuthAppScreen(makeCtx());
    expect(
      document.querySelector("[data-onboarding-screen='KEY_FROM_AUTH_APP']")
    ).not.toBeNull();
  });

  test("body and steps use authenticator-app copy", () => {
    mountKeyFromAuthAppScreen(makeCtx());
    expect(document.querySelector(".onboarding-body")?.textContent).toContain(
      "authenticator app"
    );
    const steps = document.querySelector(".onboarding-accordion-body")
      ?.textContent;
    expect(steps).toContain("Secret Key");
    expect(steps).toContain("Authenticator Key");
  });

  test("shares the live-validated key input (Confirm disabled when empty)", () => {
    mountKeyFromAuthAppScreen(makeCtx());
    expect(confirmBtn().disabled).toBe(true);
  });

  // ── pasteKeyScreen-confirm ─────────────────────────────────────────────────

  test("Confirm with valid key writes normalized secret to session and dispatches KEY_CONFIRMED", async () => {
    const ctx = makeCtx();
    mountKeyFromAuthAppScreen(ctx);
    typeKey("MZXW6YTBOI7EU4DPNZSGK3TL");
    confirmBtn().click();
    await vi.waitFor(() => expect(ctx.dispatch).toHaveBeenCalledWith("KEY_CONFIRMED"));
    expect(sessionSet).toHaveBeenCalledWith({
      [PENDING_TOTP_SECRET_SESSION_KEY]: "MZXW6YTBOI7EU4DPNZSGK3TL",
    });
  });

  test("Confirm with invalid input dispatches nothing and writes nothing to session", async () => {
    const ctx = makeCtx();
    mountKeyFromAuthAppScreen(ctx);
    typeKey("bad key 0189!");
    confirmBtn().click();
    await Promise.resolve();
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });

  test("Confirm with empty input dispatches nothing and writes nothing to session", async () => {
    const ctx = makeCtx();
    mountKeyFromAuthAppScreen(ctx);
    confirmBtn().click();
    await Promise.resolve();
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });

  // ── pasteKeyScreen-back-unmount ────────────────────────────────────────────

  test("Back click dispatches BACK", () => {
    const ctx = makeCtx();
    mountKeyFromAuthAppScreen(ctx);
    backBtn().click();
    expect(ctx.dispatch).toHaveBeenCalledWith("BACK");
  });

  test("after unmount Back and Confirm clicks dispatch nothing and write nothing", async () => {
    const ctx = makeCtx();
    const handle = mountKeyFromAuthAppScreen(ctx);
    typeKey("MZXW6YTBOI7EU4DPNZSGK3TL");
    const savedBack = backBtn();
    const savedConfirm = confirmBtn();
    handle.unmount();
    savedBack.click();
    savedConfirm.click();
    await Promise.resolve();
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});
