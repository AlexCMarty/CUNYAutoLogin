// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("totp-generator", () => ({
  TOTP: {
    generate: vi.fn().mockResolvedValue({ otp: "123456" }),
  },
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import browser from "webextension-polyfill";
import { TOTP } from "totp-generator";
import { fillTotp, getOtp } from "./totpLoginFlow";
import { unwrapErr } from "../testUtils/resultUnwrap";

// Pull only the ONBOARDING_LOGIN_PROGRESS calls out of the sendMessage spy.
const progressSteps = (): readonly string[] =>
  vi
    .mocked(browser.runtime.sendMessage)
    .mock.calls.map(([msg]) => msg as { type?: string; step?: string })
    .filter((msg) => msg.type === "ONBOARDING_LOGIN_PROGRESS")
    .map((msg) => msg.step as string);

describe("fillTotp", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
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

  // ── content/totp-login-progress [MEDIUM] ──────────────────────────────────
  // The sidebar onboarding "login checklist" beads light up from per-step
  // ONBOARDING_LOGIN_PROGRESS events. On the happy path fillTotp must emit
  // code_filling (before generating the OTP) then code_done (after Verify is
  // clicked), in that order.
  test("emits code_filling then code_done on the happy path", async () => {
    const otpInput = document.createElement("input");
    otpInput.id = "otpValue|input";
    document.body.appendChild(otpInput);
    const verifyButton = document.createElement("button");
    verifyButton.innerHTML = "Verify";
    document.body.appendChild(verifyButton);

    const result = await fillTotp("JBSWY3DPEHPK3PXP");

    expect(result.isOk()).toBe(true);
    expect(progressSteps()).toEqual(["code_filling", "code_done"]);
  });

  // A missing input element short-circuits before any progress is emitted.
  test("emits no login progress when the OTP input is missing", async () => {
    vi.useFakeTimers();
    const verifyButton = document.createElement("button");
    verifyButton.innerHTML = "Verify";
    document.body.appendChild(verifyButton);

    const pending = fillTotp("JBSWY3DPEHPK3PXP");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.isErr()).toBe(true);
    expect(progressSteps()).toEqual([]);
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

// ── content/getotp-rejection [MEDIUM] — fillTotp rejection handling ───────────
// A malformed Base32 secret makes TOTP.generate reject. fillTotp must keep that
// inside the Result contract (err "otp_generation_failed"), not throw past the
// caller's isErr() handling, and must not push a code into a rejecting field.
describe("fillTotp getOtp rejection handling", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.mocked(TOTP.generate).mockRejectedValueOnce(new Error("invalid Base32"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns err('otp_generation_failed') without throwing when TOTP.generate rejects", async () => {
    const otpInput = document.createElement("input");
    otpInput.id = "otpValue|input";
    document.body.appendChild(otpInput);

    const verifyBtn = document.createElement("button");
    verifyBtn.innerHTML = "Verify";
    const clickSpy = vi.spyOn(verifyBtn, "click");
    document.body.appendChild(verifyBtn);

    const result = await fillTotp("JBSWY3DPEHPK3PXP");

    expect(result.isErr()).toBe(true);
    expect(unwrapErr(result)).toBe("otp_generation_failed");
    // The rejecting field was never filled and Verify was never clicked.
    expect(otpInput.value).toBe("");
    expect(clickSpy).not.toHaveBeenCalled();
  });

  // The bead lights up the moment we commit to filling (code_filling), but a
  // rejecting secret must NOT advance the checklist to code_done.
  test("emits code_filling but NOT code_done when OTP generation fails", async () => {
    const otpInput = document.createElement("input");
    otpInput.id = "otpValue|input";
    document.body.appendChild(otpInput);

    const verifyBtn = document.createElement("button");
    verifyBtn.innerHTML = "Verify";
    document.body.appendChild(verifyBtn);

    const result = await fillTotp("JBSWY3DPEHPK3PXP");

    expect(result.isErr()).toBe(true);
    expect(progressSteps()).toEqual(["code_filling"]);
  });
});
