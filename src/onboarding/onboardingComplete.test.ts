import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

import browser from "webextension-polyfill";
import { clearOnboardingComplete, markOnboardingComplete } from "./onboardingComplete";

describe("markOnboardingComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sets cunyOnboardingCompleted", async () => {
    await markOnboardingComplete();
    expect(browser.storage.local.set).toHaveBeenCalledTimes(1);
    expect(browser.storage.local.set).toHaveBeenCalledWith({
      cunyOnboardingCompleted: true,
    });
    expect(browser.storage.local.remove).not.toHaveBeenCalled();
  });
});

describe("clearOnboardingComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("removes cunyOnboardingCompleted", async () => {
    await clearOnboardingComplete();
    expect(browser.storage.local.remove).toHaveBeenCalledTimes(1);
    expect(browser.storage.local.remove).toHaveBeenCalledWith("cunyOnboardingCompleted");
  });
});
