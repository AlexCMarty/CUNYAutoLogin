// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
import { startMfaEnrollVerifyOtpPolling } from "./mfaEnrollVerifyFlow";

describe("content bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.stubGlobal(
      "location",
      new URL("https://example.test/") as unknown as Location
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("startup sends AUTO_FILL_REQUEST", async () => {
    await import("./content");
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
      type: "AUTO_FILL_REQUEST",
    });
  });

  test("starts enroll-verify OTP polling on /oaa/rui even without h_ra=1", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/oaa/rui/index.html") as unknown as Location
    );
    await import("./content");
    expect(vi.mocked(startMfaEnrollVerifyOtpPolling)).toHaveBeenCalledTimes(1);
  });

  test("does not start enroll-verify OTP polling outside /oaa/rui", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/oam/server/obrareq.cgi") as unknown as Location
    );
    await import("./content");
    expect(vi.mocked(startMfaEnrollVerifyOtpPolling)).not.toHaveBeenCalled();
  });
});
