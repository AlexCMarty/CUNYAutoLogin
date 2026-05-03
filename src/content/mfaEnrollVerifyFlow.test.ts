// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
import { RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID } from "../cuny/ssoSite";

vi.mock("./totpLoginFlow", () => ({
  getOtp: vi.fn().mockResolvedValue("123456"),
}));

import browser from "webextension-polyfill";

describe("startMfaEnrollVerifyOtpPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test("installs polling interval without throwing", () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    startMfaEnrollVerifyOtpPolling();
    expect(intervalSpy).toHaveBeenCalled();
  });

  test("fills otp|input when AUTO_FILL_REQUEST returns an enroll secret", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      success: true,
      payload: {
        email: "student@login.cuny.edu",
        password: "pw",
        totpSecret: "JBSWY3DPEHPK3PXP",
      },
    });

    const otpInput = document.createElement("input");
    otpInput.id = RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID;
    document.body.appendChild(otpInput);

    startMfaEnrollVerifyOtpPolling();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    expect(otpInput.value).toBe("123456");
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
      type: "AUTO_FILL_REQUEST",
      otpContext: "enroll_verify",
    });
  });
});
