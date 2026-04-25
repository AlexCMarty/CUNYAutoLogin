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
        target: "#allow-btn",
      },
    });
    await requestAndExecuteOverlayCommand();
    expect(vi.mocked(showOverlay)).toHaveBeenCalledTimes(1);
  });
});
