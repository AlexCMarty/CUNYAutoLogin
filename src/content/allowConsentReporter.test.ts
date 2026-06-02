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
import { installAllowConsentClickReporter } from "./allowConsentReporter";

// eslint-disable-next-line max-lines-per-function
describe("installAllowConsentClickReporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubGlobal("allow", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("posts allow_button_clicked when allow button is clicked on consent page", () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/mfaConsent") as unknown as Location
    );
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    installAllowConsentClickReporter();
    const callback = addEventListenerSpy.mock.calls[0]?.[1];
    if (typeof callback !== "function") throw new Error("click listener missing");
    const fakeTarget = document.createElement("span");
    vi.spyOn(fakeTarget, "closest").mockImplementation((selector: string) =>
      selector === 'button[onclick="allow()"]' ? document.createElement("button") : null
    );
    callback({ target: fakeTarget } as unknown as Event);

    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "allow_button_clicked",
    });
  });

  test("does nothing when URL does not include mfaConsent path marker", () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/oam/server/obrareq.cgi") as unknown as Location
    );
    installAllowConsentClickReporter();
    expect(vi.mocked(browser.runtime.sendMessage)).not.toHaveBeenCalled();
  });

  test("sends allow_gate stage message on page load when on consent page", () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/mfaConsent") as unknown as Location
    );
    installAllowConsentClickReporter();
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "allow_gate",
    });
  });

  test("click on non-allow-button element does not post allow_button_clicked", () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/mfaConsent") as unknown as Location
    );
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    installAllowConsentClickReporter();
    const callback = addEventListenerSpy.mock.calls[0]?.[1];
    if (typeof callback !== "function") throw new Error("click listener missing");

    // A plain div that has no allow-button ancestor
    const fakeTarget = document.createElement("div");
    callback({ target: fakeTarget } as unknown as Event);

    // Only the page-load allow_gate message should be present, not allow_button_clicked
    const calls = vi.mocked(browser.runtime.sendMessage).mock.calls;
    const hasAllowButtonClicked = calls.some(
      ([msg]) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { stage?: string }).stage === "allow_button_clicked"
    );
    expect(hasAllowButtonClicked).toBe(false);
  });

  test("click where target is not an Element is silently ignored", () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/mfaConsent") as unknown as Location
    );
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    installAllowConsentClickReporter();
    const callback = addEventListenerSpy.mock.calls[0]?.[1];
    if (typeof callback !== "function") throw new Error("click listener missing");

    // target is a text node (not an Element)
    callback({ target: document.createTextNode("text") } as unknown as Event);

    const calls = vi.mocked(browser.runtime.sendMessage).mock.calls;
    const hasAllowButtonClicked = calls.some(
      ([msg]) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { stage?: string }).stage === "allow_button_clicked"
    );
    expect(hasAllowButtonClicked).toBe(false);
  });
});
