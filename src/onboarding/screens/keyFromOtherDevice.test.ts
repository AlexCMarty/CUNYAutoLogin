// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: { session: { set: vi.fn().mockResolvedValue(undefined) } },
  },
}));

import { mountKeyFromOtherDeviceScreen } from "./keyFromOtherDevice";
import type { OnboardingScreenContext } from "./screenContext";

const makeCtx = (qaVariant?: string): OnboardingScreenContext => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return {
    doc: document,
    root,
    qaVariant,
    getSnapshot: () => ({
      state: "KEY_FROM_OTHER_DEVICE",
      email: "",
      password: "",
      credentialError: null,
      advancedKeyFlow: false,
    }),
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    setCredentialError: vi.fn(),
    dispatch: vi.fn(),
  };
};

const keyInput = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>("[data-onboarding-key-input='true']")!;
const confirmBtn = (): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>(
    "[data-onboarding-key-confirm='true']"
  )!;
const okLine = (): HTMLElement =>
  document.querySelector<HTMLElement>("[data-onboarding-key-ok='true']")!;
const hintLine = (): HTMLElement =>
  document.querySelector<HTMLElement>("[data-onboarding-key-hint='true']")!;

const typeKey = (value: string): void => {
  const input = keyInput();
  input.value = value;
  input.dispatchEvent(new Event("input"));
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountKeyFromOtherDeviceScreen", () => {
  test("renders the KEY_FROM_OTHER_DEVICE container with its instruction copy", () => {
    mountKeyFromOtherDeviceScreen(makeCtx());
    expect(
      document.querySelector("[data-onboarding-screen='KEY_FROM_OTHER_DEVICE']")
    ).not.toBeNull();
    expect(document.querySelector(".onboarding-accordion-body")?.textContent)
      .toContain("Show my secret key");
  });

  test("empty input: hint shown, ok hidden, Confirm disabled", () => {
    mountKeyFromOtherDeviceScreen(makeCtx());
    expect(hintLine().hidden).toBe(false);
    expect(okLine().hidden).toBe(true);
    expect(confirmBtn().disabled).toBe(true);
  });

  test("typing a valid Base32 key enables Confirm and shows the ✓ line", () => {
    mountKeyFromOtherDeviceScreen(makeCtx());
    typeKey("MZXW6YTBOI7EU4DPNZSGK3TL");
    expect(confirmBtn().disabled).toBe(false);
    expect(okLine().hidden).toBe(false);
    expect(hintLine().hidden).toBe(true);
  });

  test("typing an invalid key keeps Confirm disabled", () => {
    mountKeyFromOtherDeviceScreen(makeCtx());
    typeKey("not a key 0189!"); // 0,1,8,9 and punctuation are not Base32
    expect(confirmBtn().disabled).toBe(true);
    expect(hintLine().hidden).toBe(false);
  });

  test("qaVariant='open' expands the instruction accordion", () => {
    mountKeyFromOtherDeviceScreen(makeCtx("open"));
    const details = document.querySelector<HTMLDetailsElement>(
      ".onboarding-accordion"
    )!;
    expect(details.open).toBe(true);
  });

  test("qaVariant='valid' prefills a valid key with Confirm enabled", () => {
    mountKeyFromOtherDeviceScreen(makeCtx("valid"));
    expect(keyInput().value.length).toBeGreaterThan(0);
    expect(confirmBtn().disabled).toBe(false);
    expect(okLine().hidden).toBe(false);
  });

  test("unmount removes the container", () => {
    const handle = mountKeyFromOtherDeviceScreen(makeCtx());
    handle.unmount();
    expect(
      document.querySelector("[data-onboarding-screen='KEY_FROM_OTHER_DEVICE']")
    ).toBeNull();
  });
});
