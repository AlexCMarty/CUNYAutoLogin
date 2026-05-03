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

  test("sets cunyOnboardingCompleted and removes legacy storage key", async () => {
    await markOnboardingComplete();
    expect(browser.storage.local.set).toHaveBeenCalledTimes(1);
    expect(browser.storage.local.set).toHaveBeenCalledWith({
      cunyOnboardingCompleted: true,
    });
    expect(browser.storage.local.remove).toHaveBeenCalledWith("cunyOnboardingV2CompletedV1");
  });
});

describe("clearOnboardingComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("removes current and legacy onboarding-complete keys", async () => {
    await clearOnboardingComplete();
    expect(browser.storage.local.remove).toHaveBeenCalledTimes(2);
    expect(browser.storage.local.remove).toHaveBeenNthCalledWith(1, "cunyOnboardingCompleted");
    expect(browser.storage.local.remove).toHaveBeenNthCalledWith(2, "cunyOnboardingV2CompletedV1");
  });
});
