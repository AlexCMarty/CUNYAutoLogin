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

afterEach(async () => {
  const { stopRuiOnboardingObserversForTest } = await importFresh();
  stopRuiOnboardingObserversForTest();
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

describe("ruiOnboarding — set-default kebab reporter", () => {
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

describe("ruiOnboarding — set-default 2s confirmation timeout", () => {
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

// eslint-disable-next-line max-lines-per-function
describe("ruiOnboarding — SPA view stage posting", () => {
  test("access_denied URL posts access_denied stage", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/oaa/rui/oidc/redirect?error=access_denied") as unknown as Location
    );
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("access_denied")).toBe(true);
  });

  test("oaa_spa_home posts oaa_spa_home stage on first tick", async () => {
    document.body.innerHTML = '<div id="categoryActionheader">My Security</div>';
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("oaa_spa_home")).toBe(true);
  });

  test("oaa_spa_home stage is only posted once (deduplication)", async () => {
    document.body.innerHTML = '<div id="categoryActionheader">My Security</div>';
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    vi.advanceTimersByTime(800); // two more ticks
    const posts = vi
      .mocked(browser.runtime.sendMessage)
      .mock.calls.filter(
        ([msg]) =>
          typeof msg === "object" &&
          msg !== null &&
          (msg as { stage?: string }).stage === "oaa_spa_home"
      );
    expect(posts.length).toBe(1);
  });

  test("totp_enroll_verify view posts totp_enroll_verify stage", async () => {
    document.body.innerHTML = '<input id="otp|input" />';
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("totp_enroll_verify")).toBe(true);
  });

  test("totp_enroll_secret view posts totp_enroll_secret stage", async () => {
    document.body.innerHTML = '<div aria-labelledby="key-labelled-by|label">JBSWY3DPEHPK3PXP</div>';
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("totp_enroll_secret")).toBe(true);
  });

  test("totp_enroll_secret view fills the name input with a generated alias", async () => {
    const nameInput = document.createElement("input");
    nameInput.id = "name|input";
    const secretDisplay = document.createElement("div");
    secretDisplay.setAttribute("aria-labelledby", "key-labelled-by|label");
    secretDisplay.textContent = "JBSWY3DPEHPK3PXP";
    document.body.appendChild(nameInput);
    document.body.appendChild(secretDisplay);

    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();

    // Name input should be filled with something non-empty starting with "CUNYAutoLogin-"
    expect(nameInput.value).toMatch(/^CUNYAutoLogin-[0-9a-f]{4}$/);
  });

  test("factors_list posts factors_list when factor panels are present", async () => {
    makeFactorPanel({ alias: "SomeOtherFactor" });
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("factors_list")).toBe(true);
  });

  test("factors_list posts factors_list_after_enroll when CUNYAutoLogin factor is validated", async () => {
    makeFactorPanel({ alias: "CUNYAutoLogin", validated: true, preferred: false });
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("factors_list_after_enroll")).toBe(true);
  });

  test("factors_list does NOT post factors_list_after_enroll when CUNYAutoLogin factor is unvalidated", async () => {
    makeFactorPanel({ alias: "CUNYAutoLogin", validated: false, preferred: false });
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("factors_list_after_enroll")).toBe(false);
  });

  test("factors_list posts unverified_cunyautologin when factor is present but not validated", async () => {
    makeFactorPanel({ alias: "CUNYAutoLogin", validated: false, preferred: false });
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("unverified_cunyautologin")).toBe(true);
  });

  test("factors_list posts totp_factor_limit when TOTP option is disabled", async () => {
    makeFactorPanel({ alias: "SomeOtherFactor" });
    const totpOpt = document.createElement("oj-option");
    totpOpt.id = "ChallengeOMATOTP";
    totpOpt.classList.add("oj-disabled");
    document.body.appendChild(totpOpt);
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("totp_factor_limit")).toBe(true);
  });

  test("factors_list does not post factors_list when no factor panels exist", async () => {
    document.body.innerHTML = "";
    // factors_list view requires factor-panel elements; empty DOM → loading
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();
    expect(wasStagePosted("factors_list")).toBe(false);
  });

  test("startRuiOnboardingObservers is idempotent — calling twice does not double-register poll", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    const intervalSpy = vi.spyOn(window, "setInterval");
    startRuiOnboardingObservers();
    startRuiOnboardingObservers();
    expect(intervalSpy).toHaveBeenCalledTimes(1);
  });
});

describe("ruiOnboarding — menu click reporters", () => {
  test("clicking add-factor menu button posts add_factor stage", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();

    // Simulate the add-factor menu button structure
    const menuBtn = document.createElement("oj-menu-button");
    menuBtn.className = "menu-button";
    const innerBtn = document.createElement("button");
    menuBtn.appendChild(innerBtn);
    document.body.appendChild(menuBtn);

    innerBtn.click();
    expect(wasStagePosted("add_factor")).toBe(true);
  });

  test("clicking TOTP oj-option (not disabled) posts factor_type_select", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();

    const totpOpt = document.createElement("oj-option");
    totpOpt.id = "ChallengeOMATOTP";
    document.body.appendChild(totpOpt);

    totpOpt.click();
    expect(wasStagePosted("factor_type_select")).toBe(true);
  });

  test("clicking disabled TOTP oj-option does NOT post factor_type_select", async () => {
    const { startRuiOnboardingObservers } = await importFresh();
    startRuiOnboardingObservers();

    const totpOpt = document.createElement("oj-option");
    totpOpt.id = "ChallengeOMATOTP";
    totpOpt.classList.add("oj-disabled");
    document.body.appendChild(totpOpt);

    totpOpt.click();
    expect(wasStagePosted("factor_type_select")).toBe(false);
  });
});
