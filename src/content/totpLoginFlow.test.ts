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

// ── content/totp-verify-button-contract [MEDIUM] ──────────────────────────────
// CUNY wraps the "Verify" label in a <span>; the flow finds buttons via
// innerHTML.includes("Verify"). A decoy with "Verify" only in an attribute
// must not interfere with the found-and-clicked button.
describe("fillTotp verify-button DOM contract", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("finds and clicks a button whose innerHTML contains <span>Verify</span>", async () => {
    const otpInput = document.createElement("input");
    otpInput.id = "otpValue|input";
    document.body.appendChild(otpInput);

    const realVerifyBtn = document.createElement("button");
    realVerifyBtn.innerHTML = "<span>Verify</span>";
    const clickSpy = vi.spyOn(realVerifyBtn, "click");
    document.body.appendChild(realVerifyBtn);

    const result = await fillTotp("JBSWY3DPEHPK3PXP");
    expect(result.isOk()).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(otpInput.value).toBe("123456");
  });

  test("does not click a decoy button that has Verify only in a data attribute", async () => {
    vi.useFakeTimers();
    const otpInput = document.createElement("input");
    otpInput.id = "otpValue|input";
    document.body.appendChild(otpInput);

    // Decoy: "Verify" is in an attribute, not innerHTML text
    const decoy = document.createElement("button");
    decoy.setAttribute("data-label", "Verify");
    decoy.innerHTML = "Submit";
    const decoyClick = vi.spyOn(decoy, "click");
    document.body.appendChild(decoy);

    const pending = fillTotp("JBSWY3DPEHPK3PXP");
    await vi.runAllTimersAsync();
    const result = await pending;

    // Without a real Verify button, fillTotp must return err
    expect(result.isErr()).toBe(true);
    expect(decoyClick).not.toHaveBeenCalled();
  });
});

// ── content/getotp-rejection [MEDIUM] — fillTotp propagation side ─────────────
// When getOtp rejects, fillTotp propagates the rejection (it is not wrapped in
// a try/catch). Callers must handle thrown errors, not just Result.isErr().
describe("fillTotp getOtp rejection propagation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.mocked(TOTP.generate).mockRejectedValueOnce(new Error("invalid Base32"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("propagates the rejection from getOtp when TOTP.generate throws", async () => {
    const otpInput = document.createElement("input");
    otpInput.id = "otpValue|input";
    document.body.appendChild(otpInput);

    const verifyBtn = document.createElement("button");
    verifyBtn.innerHTML = "Verify";
    document.body.appendChild(verifyBtn);

    await expect(fillTotp("JBSWY3DPEHPK3PXP")).rejects.toThrow("invalid Base32");
    // Field was not filled because rejection happened before setInputValue
    expect(otpInput.value).toBe("");
  });
});
