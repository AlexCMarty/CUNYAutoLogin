// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi
        .fn()
        .mockResolvedValue({ success: false, reason: "no_session_master" }),
      onMessage: {
        addListener: vi.fn(),
      },
    },
  },
}));

vi.mock("./mfaEnrollVerifyFlow", () => ({
  startMfaEnrollVerifyOtpPolling: vi.fn(),
}));

import browser from "webextension-polyfill";

describe("content bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  test("startup sends AUTO_FILL_REQUEST", async () => {
    await import("./content");
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
      type: "AUTO_FILL_REQUEST",
    });
  });
});
