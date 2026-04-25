// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("totp-generator", () => ({
  TOTP: {
    generate: vi.fn().mockResolvedValue({ otp: "123456" }),
  },
}));

import { fillTotp } from "./totpLoginFlow";

describe("fillTotp", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
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
});
