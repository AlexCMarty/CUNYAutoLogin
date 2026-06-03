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

vi.mock("./totpLoginFlow", () => ({
  fillTotp: vi.fn().mockResolvedValue({ isErr: () => false, isOk: () => true, value: true }),
}));

vi.mock("./banner", () => ({
  mountTotpErrorBanner: vi.fn(),
  mountCredentialErrorBanner: vi.fn(),
  unmountCredentialErrorBanner: vi.fn(),
  unmountTotpErrorBanner: vi.fn(),
}));

import browser from "webextension-polyfill";
import { startMfaEnrollVerifyOtpPolling } from "./mfaEnrollVerifyFlow";
import { fillTotp } from "./totpLoginFlow";
import { mountTotpErrorBanner } from "./banner";
import { matchesTotpPage, SSO_LOGIN_ORIGIN } from "../cuny/ssoSite";

// Derive the TOTP page URL from the real matcher so any path-marker change here fails loudly.
// matchesTotpPage uses "/oaa-totp-factor/" as the path segment.
const TOTP_PAGE_URL = `${SSO_LOGIN_ORIGIN}/oaa-totp-factor/`;
// Verify the constant against the matcher at import time (catches drift immediately).
if (!matchesTotpPage(TOTP_PAGE_URL)) {
  throw new Error("Test setup error: TOTP_PAGE_URL does not match matchesTotpPage — update the path literal");
}

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

  test("sends ONBOARDING_CONTENT_SCRIPT_READY on startup", async () => {
    await import("./content");
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
      type: "ONBOARDING_CONTENT_SCRIPT_READY",
    });
  });

  test("startup is resilient to sendMessage rejection", async () => {
    vi.mocked(browser.runtime.sendMessage).mockRejectedValue(new Error("disconnected"));
    await expect(import("./content")).resolves.toBeDefined();
  });
});

// ── content/totp-login-emsg-second-failure [HIGH] ────────────────────────────
// On the TOTP login page main() always sends announceCunyTotpChallenge
// (ONBOARDING_STAGE_DETECTED cuny_totp_challenge). When ?emsg is present it
// additionally sends ONBOARDING_VERIFY_STATUS second_failure, mounts the retry
// banner, and SKIPS auto-fill (OTP input stays empty).
describe("content bootstrap — TOTP page emsg handling", () => {
  const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("with ?emsg: sends cuny_totp_challenge AND second_failure; does NOT call fillTotp", async () => {
    vi.stubGlobal(
      "location",
      new URL(`${TOTP_PAGE_URL}?emsg=rejected`) as unknown as Location
    );
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      success: true,
      payload: { email: "student@login.cuny.edu", password: "pw", totpSecret: TOTP_SECRET },
    });

    await import("./content");

    const sentMessages = vi.mocked(browser.runtime.sendMessage).mock.calls.map(([msg]) => msg);

    const stageDetectedCall = sentMessages.find(
      (msg) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { type?: string; stage?: string }).type === "ONBOARDING_STAGE_DETECTED" &&
        (msg as { stage?: string }).stage === "cuny_totp_challenge"
    );
    expect(stageDetectedCall).toBeDefined();

    const secondFailureCall = sentMessages.find(
      (msg) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { type?: string; status?: string }).type === "ONBOARDING_VERIFY_STATUS" &&
        (msg as { status?: string }).status === "second_failure"
    );
    expect(secondFailureCall).toBeDefined();

    // fillTotp must NOT be called when emsg is present (banner is shown instead)
    expect(vi.mocked(fillTotp)).not.toHaveBeenCalled();
    // The retry banner must be mounted
    expect(vi.mocked(mountTotpErrorBanner)).toHaveBeenCalledTimes(1);
  });

  test("without ?emsg: sends cuny_totp_challenge and calls fillTotp (auto-fill runs)", async () => {
    vi.stubGlobal(
      "location",
      new URL(TOTP_PAGE_URL) as unknown as Location
    );
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      success: true,
      payload: { email: "student@login.cuny.edu", password: "pw", totpSecret: TOTP_SECRET },
    });

    await import("./content");

    const sentMessages = vi.mocked(browser.runtime.sendMessage).mock.calls.map(([msg]) => msg);

    const stageDetectedCall = sentMessages.find(
      (msg) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { type?: string; stage?: string }).type === "ONBOARDING_STAGE_DETECTED" &&
        (msg as { stage?: string }).stage === "cuny_totp_challenge"
    );
    expect(stageDetectedCall).toBeDefined();

    // No second_failure message without emsg
    const secondFailureCall = sentMessages.find(
      (msg) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { type?: string; status?: string }).type === "ONBOARDING_VERIFY_STATUS" &&
        (msg as { status?: string }).status === "second_failure"
    );
    expect(secondFailureCall).toBeUndefined();

    // fillTotp IS called when no emsg is present
    expect(vi.mocked(fillTotp)).toHaveBeenCalledWith(TOTP_SECRET);
  });
});
