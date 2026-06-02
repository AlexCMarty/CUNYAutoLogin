import { beforeEach, describe, expect, test, vi } from "vitest";

const { waitForEnrollTotpSecret } = vi.hoisted(() => ({
  waitForEnrollTotpSecret: vi.fn(),
}));

vi.mock("./domWait", () => ({
  waitForEnrollTotpSecret,
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

describe("watchTotpSecretOnEnrollPage", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    waitForEnrollTotpSecret.mockReset();
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);
  });

  test("sends TOTP_SECRET_FROM_PAGE once when a new secret is observed", async () => {
    waitForEnrollTotpSecret.mockResolvedValue("NEWSECRET");
    const browser = (await import("webextension-polyfill")).default;
    const { watchTotpSecretOnEnrollPage } = await import("./totpEnrollSecretBridge");
    await watchTotpSecretOnEnrollPage();
    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: "TOTP_SECRET_FROM_PAGE",
      secret: "NEWSECRET",
    });
  });

  test("does not send when wait resolves null", async () => {
    waitForEnrollTotpSecret.mockResolvedValue(null);
    const browser = (await import("webextension-polyfill")).default;
    const { watchTotpSecretOnEnrollPage } = await import("./totpEnrollSecretBridge");
    await watchTotpSecretOnEnrollPage();
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test("dedupes the same secret on a second watch call", async () => {
    waitForEnrollTotpSecret.mockResolvedValue("SAME");
    const browser = (await import("webextension-polyfill")).default;
    const { watchTotpSecretOnEnrollPage } = await import("./totpEnrollSecretBridge");
    await watchTotpSecretOnEnrollPage();
    await watchTotpSecretOnEnrollPage();
    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  test("sends again when a different secret appears after the first", async () => {
    waitForEnrollTotpSecret.mockResolvedValueOnce("FIRST").mockResolvedValueOnce("SECOND");
    const browser = (await import("webextension-polyfill")).default;
    const { watchTotpSecretOnEnrollPage } = await import("./totpEnrollSecretBridge");
    await watchTotpSecretOnEnrollPage();
    await watchTotpSecretOnEnrollPage();
    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(browser.runtime.sendMessage).toHaveBeenNthCalledWith(1, {
      type: "TOTP_SECRET_FROM_PAGE",
      secret: "FIRST",
    });
    expect(browser.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      type: "TOTP_SECRET_FROM_PAGE",
      secret: "SECOND",
    });
  });

  test("does not update lastPostedSecret and does not throw when sendMessage rejects", async () => {
    waitForEnrollTotpSecret.mockResolvedValueOnce("NEWSECRET").mockResolvedValueOnce("NEWSECRET");
    const browser = (await import("webextension-polyfill")).default;
    vi.mocked(browser.runtime.sendMessage).mockRejectedValueOnce(new Error("port closed"));
    const { watchTotpSecretOnEnrollPage } = await import("./totpEnrollSecretBridge");
    // First call: sendMessage throws — secret should NOT be stored as lastPosted
    await expect(watchTotpSecretOnEnrollPage()).resolves.toBeUndefined();
    // Second call: same secret — since it was never successfully posted, should try again
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce(undefined);
    await watchTotpSecretOnEnrollPage();
    // Should have been called a second time
    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });
});
