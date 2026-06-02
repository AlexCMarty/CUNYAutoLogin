// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("totp-generator", () => ({
  TOTP: {
    generate: vi.fn().mockResolvedValue({ otp: "123456" }),
  },
}));

import { TOTP } from "totp-generator";
import { fillTotp, getOtp } from "./totpLoginFlow";
import { unwrapErr } from "../testUtils/resultUnwrap";

describe("fillTotp", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("fills OTP input and clicks verify button", async () => {
    const otpInput = document.createElement("input");
    otpInput.id = "otpValue|input";
    document.body.appendChild(otpInput);
    const verifyButton = document.createElement("button");
    verifyButton.innerHTML = "Verify";
    const clickSpy = vi.spyOn(verifyButton, "click");
    document.body.appendChild(verifyButton);

    const result = await fillTotp("JBSWY3DPEHPK3PXP");
    expect(result.isOk()).toBe(true);
    expect(otpInput.value).toBe("123456");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("returns err otp_input_not_found when OTP input is absent", async () => {
    vi.useFakeTimers();
    // Add verify button but no OTP input
    const verifyButton = document.createElement("button");
    verifyButton.innerHTML = "Verify";
    document.body.appendChild(verifyButton);

    const pending = fillTotp("JBSWY3DPEHPK3PXP");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.isErr()).toBe(true);
    expect(unwrapErr(result)).toBe("otp_input_not_found");
  });

  test("returns err verify_button_not_found when verify button is absent", async () => {
    vi.useFakeTimers();
    // Add OTP input but no verify button
    const otpInput = document.createElement("input");
    otpInput.id = "otpValue|input";
    document.body.appendChild(otpInput);

    const pending = fillTotp("JBSWY3DPEHPK3PXP");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.isErr()).toBe(true);
    expect(unwrapErr(result)).toBe("verify_button_not_found");
  });

  test("returns err otp_input_not_found when both input and button are absent", async () => {
    vi.useFakeTimers();
    const pending = fillTotp("JBSWY3DPEHPK3PXP");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.isErr()).toBe(true);
    expect(unwrapErr(result)).toBe("otp_input_not_found");
  });
});

describe("getOtp", () => {
  test("delegates to TOTP.generate and returns the otp string", async () => {
    const otp = await getOtp("JBSWY3DPEHPK3PXP");
    expect(otp).toBe("123456");
    expect(vi.mocked(TOTP.generate)).toHaveBeenCalledWith(
      "JBSWY3DPEHPK3PXP",
      expect.objectContaining({ algorithm: "SHA-1", digits: 6, period: 30 })
    );
  });
});
