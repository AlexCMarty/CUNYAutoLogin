// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({
        success: false,
        reason: "no_session_master",
      }),
    },
  },
}));

import { startMfaEnrollVerifyOtpPolling } from "./mfaEnrollVerifyFlow";

describe("startMfaEnrollVerifyOtpPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  test("installs polling interval without throwing", () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    startMfaEnrollVerifyOtpPolling();
    expect(intervalSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
