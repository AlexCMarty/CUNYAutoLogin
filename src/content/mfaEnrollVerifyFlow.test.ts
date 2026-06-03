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
import { getOtp } from "./totpLoginFlow";

// eslint-disable-next-line max-lines-per-function
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

  test("does nothing on tick when otp field is absent from DOM", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      success: true,
      payload: {
        email: "student@login.cuny.edu",
        password: "pw",
        totpSecret: "JBSWY3DPEHPK3PXP",
      },
    });
    // No otp input appended

    startMfaEnrollVerifyOtpPolling();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    // sendMessage for AUTO_FILL_REQUEST should NOT have been called since there is no OTP field
    const autofillCalls = vi.mocked(browser.runtime.sendMessage).mock.calls.filter(
      ([msg]) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { type?: string }).type === "AUTO_FILL_REQUEST"
    );
    expect(autofillCalls).toHaveLength(0);
  });

  test("sends ONBOARDING_VERIFY_STATUS pending after successful fill", async () => {
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

    const statusCalls = vi.mocked(browser.runtime.sendMessage).mock.calls.filter(
      ([msg]) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { type?: string }).type === "ONBOARDING_VERIFY_STATUS"
    );
    expect(statusCalls.length).toBeGreaterThanOrEqual(1);
    expect(statusCalls[0]?.[0]).toMatchObject({
      type: "ONBOARDING_VERIFY_STATUS",
      status: "pending",
    });
  });

  test("client OTP validation error stops polling", async () => {
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

    // Inject the client-side OTP error element ("Enter a OTP code")
    const errorContainer = document.createElement("div");
    errorContainer.className = "oj-messaging-inline-container";
    const detail = document.createElement("div");
    detail.className = "oj-message-detail";
    detail.textContent = "Enter a OTP code";
    errorContainer.appendChild(detail);
    document.body.appendChild(errorContainer);

    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    startMfaEnrollVerifyOtpPolling();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  test("returns false and does not fill when vault returns no_vault", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      success: false,
      reason: "no_vault",
    });

    const otpInput = document.createElement("input");
    otpInput.id = RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID;
    document.body.appendChild(otpInput);

    startMfaEnrollVerifyOtpPolling();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    expect(otpInput.value).toBe("");
  });

  test("returns false and does not fill when totpSecret is empty string", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      success: true,
      payload: {
        email: "student@login.cuny.edu",
        password: "pw",
        totpSecret: "",
      },
    });

    const otpInput = document.createElement("input");
    otpInput.id = RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID;
    document.body.appendChild(otpInput);

    startMfaEnrollVerifyOtpPolling();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    expect(otpInput.value).toBe("");
  });

  test("server-side first failure sends first_failure status and resets otpFilled", async () => {
    let callCount = 0;
    vi.mocked(browser.runtime.sendMessage).mockImplementation(async (msg) => {
      const typedMsg = msg as { type?: string };
      if (typedMsg.type === "AUTO_FILL_REQUEST") {
        callCount++;
        return {
          success: true,
          payload: {
            email: "student@login.cuny.edu",
            password: "pw",
            totpSecret: "JBSWY3DPEHPK3PXP",
          },
        };
      }
      return undefined;
    });

    const otpInput = document.createElement("input");
    otpInput.id = RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID;
    document.body.appendChild(otpInput);

    startMfaEnrollVerifyOtpPolling();
    // First tick: fills OTP
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    // Now inject the server-side error so next tick sees it
    const errorContainer = document.createElement("div");
    errorContainer.className = "oj-messaging-inline-container";
    const detail = document.createElement("div");
    detail.className = "oj-message-detail";
    detail.textContent = "Incorrect code";
    errorContainer.appendChild(detail);
    document.body.appendChild(errorContainer);

    // Second tick: should detect server error on filled state
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    const firstFailureCalls = vi.mocked(browser.runtime.sendMessage).mock.calls.filter(
      ([msg]) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { status?: string }).status === "first_failure"
    );
    expect(firstFailureCalls.length).toBeGreaterThanOrEqual(1);
  });

  // ── content/mfa-second-failure-unpinned [CRITICAL] ────────────────────────
  // The SECOND wrong-code response must send exactly one second_failure, set
  // automationPaused, and stop the poll (clearInterval) so the extension never
  // re-submits the TOTP (account-lockout guard).
  test("second wrong code sends second_failure, clears interval, and stops re-submitting", async () => {
    vi.mocked(browser.runtime.sendMessage).mockImplementation(async (msg) => {
      if ((msg as { type?: string }).type === "AUTO_FILL_REQUEST") {
        return {
          success: true,
          payload: {
            email: "student@login.cuny.edu",
            password: "pw",
            totpSecret: "JBSWY3DPEHPK3PXP",
          },
        };
      }
      return undefined;
    });

    const otpInput = document.createElement("input");
    otpInput.id = RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID;
    document.body.appendChild(otpInput);

    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    startMfaEnrollVerifyOtpPolling();

    // Tick 1: OTP fills successfully
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();
    expect(otpInput.value).toBe("123456");

    // Now inject the server-side error (first wrong code)
    const errorContainer = document.createElement("div");
    errorContainer.className = "oj-messaging-inline-container";
    const detail = document.createElement("div");
    detail.className = "oj-message-detail";
    detail.textContent = "Incorrect code";
    errorContainer.appendChild(detail);
    document.body.appendChild(errorContainer);

    // Tick 2: first_failure — OTP resets, no stop yet
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();
    const isFirstFailure = ([msg]: [unknown, ...unknown[]]): boolean =>
      typeof msg === "object" && msg !== null &&
      (msg as { type?: string }).type === "ONBOARDING_VERIFY_STATUS" &&
      (msg as { status?: string }).status === "first_failure";
    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.filter(isFirstFailure)).toHaveLength(1);
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    // Tick 3 (OTP re-filled after reset): fill happens
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    // Tick 4: second wrong code → second_failure + stop
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    const isSecondFailure = ([msg]: [unknown, ...unknown[]]): boolean =>
      typeof msg === "object" && msg !== null &&
      (msg as { type?: string }).type === "ONBOARDING_VERIFY_STATUS" &&
      (msg as { status?: string }).status === "second_failure";
    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.filter(isSecondFailure)).toHaveLength(1);
    expect(clearIntervalSpy).toHaveBeenCalled();

    // After halt: no further AUTO_FILL_REQUEST messages
    vi.clearAllMocks();
    await vi.advanceTimersByTimeAsync(2000);
    await vi.runOnlyPendingTimersAsync();
    const isAutoFill = ([msg]: [unknown, ...unknown[]]): boolean =>
      typeof msg === "object" && msg !== null && (msg as { type?: string }).type === "AUTO_FILL_REQUEST";
    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.filter(isAutoFill)).toHaveLength(0);
  });

  // ── content/mfa-clienterror-no-fill [HIGH] ─────────────────────────────────
  // When "Enter a OTP code" is present the tick MUST halt before requesting the
  // vault — the OTP input stays empty and zero AUTO_FILL_REQUEST messages fire.
  test("client OTP validation error: otp input stays empty and no AUTO_FILL_REQUEST sent", async () => {
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

    // Pre-inject client-side error before polling starts
    const errorContainer = document.createElement("div");
    errorContainer.className = "oj-messaging-inline-container";
    const detail = document.createElement("div");
    detail.className = "oj-message-detail";
    detail.textContent = "Enter a OTP code";
    errorContainer.appendChild(detail);
    document.body.appendChild(errorContainer);

    startMfaEnrollVerifyOtpPolling();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    expect(otpInput.value).toBe("");
    const isAutoFillMsg = ([msg]: [unknown, ...unknown[]]): boolean =>
      typeof msg === "object" && msg !== null && (msg as { type?: string }).type === "AUTO_FILL_REQUEST";
    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.filter(isAutoFillMsg)).toHaveLength(0);
  });

  // ── content/getotp-rejection [MEDIUM] — enroll tick side ──────────────────
  // When getOtp rejects (malformed Base32 secret), the try/catch in
  // tryFillMfaEnrollVerifyOtp swallows the error → field stays empty, no
  // "pending" status is sent.
  test("getOtp rejection is swallowed: field stays empty and no pending status sent", async () => {
    // Reject ALL calls for the duration of this test; restore the default after.
    vi.mocked(getOtp).mockRejectedValue(new Error("invalid Base32 secret"));
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      success: true,
      payload: {
        email: "student@login.cuny.edu",
        password: "pw",
        totpSecret: "NOT_VALID_BASE32!!!",
      },
    });

    const otpInput = document.createElement("input");
    otpInput.id = RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID;
    document.body.appendChild(otpInput);

    startMfaEnrollVerifyOtpPolling();
    // Advance exactly one poll interval (500 ms) then flush pending microtasks.
    await vi.advanceTimersByTimeAsync(500);
    await vi.runOnlyPendingTimersAsync();

    // Restore the default so later tests are unaffected (clearAllMocks resets
    // calls but not the mock implementation queue).
    vi.mocked(getOtp).mockResolvedValue("123456");

    expect(otpInput.value).toBe("");
    const isPendingStatus = ([msg]: [unknown, ...unknown[]]): boolean =>
      typeof msg === "object" && msg !== null &&
      (msg as { type?: string }).type === "ONBOARDING_VERIFY_STATUS" &&
      (msg as { status?: string }).status === "pending";
    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.filter(isPendingStatus)).toHaveLength(0);
  });

  test("isAutoFillResponse returning false is handled gracefully", async () => {
    // sendMessage returns a value with no 'success' field (not a valid AutoFillResponse)
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({ someOtherField: true });

    const otpInput = document.createElement("input");
    otpInput.id = RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID;
    document.body.appendChild(otpInput);

    startMfaEnrollVerifyOtpPolling();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    // Should not fill
    expect(otpInput.value).toBe("");
  });

  test("shouldAutoSubmit is true when URL has wrongCode=1 param — clicks Verify and Save button", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://ssologin.cuny.edu/oaa/rui/index.html?wrongCode=1") as unknown as Location
    );
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

    // Add a "Verify and Save" button
    const verifyBtn = document.createElement("button");
    verifyBtn.textContent = "Verify and Save";
    document.body.appendChild(verifyBtn);
    const clickSpy = vi.spyOn(verifyBtn, "click");

    startMfaEnrollVerifyOtpPolling();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runOnlyPendingTimersAsync();

    expect(clickSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
