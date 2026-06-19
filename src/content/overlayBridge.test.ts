// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ overlayCommand: null }),
    },
  },
}));

vi.mock("./overlay", () => ({
  showOverlay: vi.fn(),
  hideOverlay: vi.fn(),
}));

import browser from "webextension-polyfill";
import { hideOverlay, showOverlay } from "./overlay";
import { executeOverlayCommand, requestAndExecuteOverlayCommand } from "./overlayBridge";

describe("overlayBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("hide command calls hideOverlay", () => {
    executeOverlayCommand({ type: "ONBOARDING_OVERLAY_COMMAND", action: "hide" });
    expect(vi.mocked(hideOverlay)).toHaveBeenCalledTimes(1);
  });

  test("requestAndExecuteOverlayCommand executes returned show command", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({
      overlayCommand: {
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: { type: "css", selector: "#allow-btn" },
      },
    });
    await requestAndExecuteOverlayCommand();
    expect(vi.mocked(showOverlay)).toHaveBeenCalledTimes(1);
  });

  test("show command with targetSpec calls showOverlay with the spec", () => {
    executeOverlayCommand({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "show",
      targetSpec: { type: "css", selector: ".my-btn" },
      tooltipText: "Click this",
      stepIndex: 2,
      stepTotal: 3,
    });
    expect(vi.mocked(showOverlay)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showOverlay)).toHaveBeenCalledWith(
      { type: "css", selector: ".my-btn" },
      "Click this",
      2,
      3,
      expect.any(Function)
    );
  });

  test("show command with neither target nor targetSpec is a no-op", () => {
    executeOverlayCommand({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "show",
    });
    expect(vi.mocked(showOverlay)).not.toHaveBeenCalled();
    expect(vi.mocked(hideOverlay)).not.toHaveBeenCalled();
  });

  test("requestAndExecuteOverlayCommand does nothing when response is not an overlay command response", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({ otherField: true });
    await requestAndExecuteOverlayCommand();
    expect(vi.mocked(showOverlay)).not.toHaveBeenCalled();
    expect(vi.mocked(hideOverlay)).not.toHaveBeenCalled();
  });

  test("requestAndExecuteOverlayCommand does nothing when overlayCommand is null", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({ overlayCommand: null });
    await requestAndExecuteOverlayCommand();
    expect(vi.mocked(showOverlay)).not.toHaveBeenCalled();
    expect(vi.mocked(hideOverlay)).not.toHaveBeenCalled();
  });

  test("requestAndExecuteOverlayCommand is resilient to sendMessage rejection", async () => {
    vi.mocked(browser.runtime.sendMessage).mockRejectedValueOnce(new Error("disconnected"));
    await expect(requestAndExecuteOverlayCommand()).resolves.toBeUndefined();
  });

  test("show command onNotFound callback sends target_not_found stage", () => {
    executeOverlayCommand({
      type: "ONBOARDING_OVERLAY_COMMAND",
      action: "show",
      targetSpec: { type: "css", selector: "#some-btn" },
    });
    // Extract the onNotFound callback passed to showOverlay and call it
    const onNotFound = vi.mocked(showOverlay).mock.calls[0]?.[4];
    expect(typeof onNotFound).toBe("function");
    onNotFound?.();
    expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
      type: "ONBOARDING_STAGE_DETECTED",
      stage: "target_not_found",
    });
  });
});
