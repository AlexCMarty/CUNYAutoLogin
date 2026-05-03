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
});
