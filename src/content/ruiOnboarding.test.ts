// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import browser from "webextension-polyfill";

type FactorAttrs = {
  alias: string;
  preferred?: boolean;
  validated?: boolean;
};

const setFactorJson = (panel: Element, attrs: FactorAttrs): void => {
  panel.setAttribute(
    "factor",
    JSON.stringify({
      factorAlias: attrs.alias,
      factorIsValidated: attrs.validated ?? true,
      factorIsPreferred: attrs.preferred ?? false,
    })
  );
};

const makeFactorPanel = (
  attrs: FactorAttrs
): { panel: Element; kebabBtn: HTMLButtonElement } => {
  const panel = document.createElement("factor-panel");
  setFactorJson(panel, attrs);
  const kebab = document.createElement("oj-menu-button");
  kebab.className = "oj-button-sm";
  const kebabBtn = document.createElement("button");
  kebab.appendChild(kebabBtn);
  panel.appendChild(kebab);
  document.body.appendChild(panel);
  return { panel, kebabBtn };
};

const importFresh = async (): Promise<
  typeof import("./ruiOnboarding")
> => {
  vi.resetModules();
  return import("./ruiOnboarding");
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);
  vi.useFakeTimers();
  document.body.innerHTML = "";
  // URL without access_denied query param.
  const url = "https://ssologin.cuny.edu/oaa/rui/index.html?h_ra=1";
  vi.stubGlobal("location", new URL(url) as unknown as Location);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const wasStagePosted = (stage: string): boolean =>
  vi
    .mocked(browser.runtime.sendMessage)
    .mock.calls.some(
      ([msg]) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { stage?: string }).stage === stage
    );

describe("ruiOnboarding — set-default kebab reporter (plan-08)", () => {
  test("clicking CUNYAutoLogin factor's kebab posts set_default_menu_opened", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    const { kebabBtn } = makeFactorPanel({ alias: "CUNYAutoLogin" });
    kebabBtn.click();
    expect(wasStagePosted("set_default_menu_opened")).toBe(true);
  });

  test("clicking an unrelated factor's kebab does NOT post set_default_menu_opened", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    const { kebabBtn } = makeFactorPanel({ alias: "SomeOtherFactor" });
    kebabBtn.click();
    expect(wasStagePosted("set_default_menu_opened")).toBe(false);
  });

  test("clicking a non-kebab element does NOT post set_default_menu_opened", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    makeFactorPanel({ alias: "CUNYAutoLogin" });
    const unrelated = document.createElement("div");
    document.body.appendChild(unrelated);
    unrelated.click();
    expect(wasStagePosted("set_default_menu_opened")).toBe(false);
  });
});

describe("ruiOnboarding — set-default 2s confirmation timeout (plan-08)", () => {
  test("no factorIsPreferred flip within 2s → posts target_not_found", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    const { kebabBtn } = makeFactorPanel({
      alias: "CUNYAutoLogin",
      preferred: false,
    });
    kebabBtn.click();
    expect(wasStagePosted("target_not_found")).toBe(false);
    vi.advanceTimersByTime(1999);
    expect(wasStagePosted("target_not_found")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(wasStagePosted("target_not_found")).toBe(true);
  });

  test("factorIsPreferred flips before timeout → posts set_default_confirmed, suppresses target_not_found", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    const { kebabBtn, panel } = makeFactorPanel({
      alias: "CUNYAutoLogin",
      preferred: false,
    });
    kebabBtn.click();
    // Simulate CUNY flipping the flag ~1.1s later — inside the 2s window.
    vi.advanceTimersByTime(1100);
    setFactorJson(panel, { alias: "CUNYAutoLogin", preferred: true });
    // Next 400ms tick picks up the flip.
    vi.advanceTimersByTime(400);
    expect(wasStagePosted("set_default_confirmed")).toBe(true);
    // Advance past the original 2s deadline — timeout must have been disarmed.
    vi.advanceTimersByTime(2000);
    expect(wasStagePosted("target_not_found")).toBe(false);
  });

  test("timeout does not fire if kebab was never clicked", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    makeFactorPanel({ alias: "CUNYAutoLogin", preferred: false });
    vi.advanceTimersByTime(5000);
    expect(wasStagePosted("target_not_found")).toBe(false);
  });
});
