// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(message: unknown) => Promise<unknown>>(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { sendMessage: sendMessageMock },
  },
}));

import { appendTabHint, appendStepProgress, sendShowOverlayCommand, sendHideOverlayCommand } from "./guidedCommon";

beforeEach(() => {
  sendMessageMock.mockReset();
  sendMessageMock.mockResolvedValue(undefined);
  document.body.innerHTML = "";
});

describe("appendTabHint", () => {
  test("appends a paragraph with the given text", () => {
    const container = document.createElement("div");
    appendTabHint(document, container, "We've highlighted the next control.");
    const hint = container.querySelector("p.onboarding-directional");
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toBe("We've highlighted the next control.");
  });

  test("applies onboarding-directional class", () => {
    const container = document.createElement("div");
    appendTabHint(document, container, "hint text");
    expect(container.querySelector(".onboarding-directional")).not.toBeNull();
  });

  test("appends to container, not body", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    appendTabHint(document, container, "text");
    expect(container.children.length).toBe(1);
    expect(document.body.children.length).toBe(1);
  });
});

describe("appendStepProgress", () => {
  test("appends a step progress element", () => {
    const container = document.createElement("div");
    appendStepProgress(document, container, 3, 8);
    expect(container.querySelector(".onboarding-step-progress")).not.toBeNull();
  });

  test("shows correct step text", () => {
    const container = document.createElement("div");
    appendStepProgress(document, container, 3, 8);
    const sub = container.querySelector(".onboarding-sub");
    expect(sub?.textContent).toBe("Step 3 of 8");
  });

  test("fill width reflects current/total ratio", () => {
    const container = document.createElement("div");
    appendStepProgress(document, container, 4, 8);
    const fill = container.querySelector<HTMLElement>(".onboarding-step-progress-fill");
    expect(fill?.style.width).toBe("50%");
  });

  test("first step has 12.5% fill width for 1/8", () => {
    const container = document.createElement("div");
    appendStepProgress(document, container, 1, 8);
    const fill = container.querySelector<HTMLElement>(".onboarding-step-progress-fill");
    expect(fill?.style.width).toBe("12.5%");
  });

  test("last step has 100% fill width for 8/8", () => {
    const container = document.createElement("div");
    appendStepProgress(document, container, 8, 8);
    const fill = container.querySelector<HTMLElement>(".onboarding-step-progress-fill");
    expect(fill?.style.width).toBe("100%");
  });

  test("appends a progress bar wrapper element", () => {
    const container = document.createElement("div");
    appendStepProgress(document, container, 2, 8);
    expect(container.querySelector(".onboarding-step-progress-bar")).not.toBeNull();
  });
});

describe("sendShowOverlayCommand", () => {
  test("calls browser.runtime.sendMessage with ONBOARDING_OVERLAY_COMMAND show action", () => {
    sendShowOverlayCommand({
      targetSpec: { type: "css", selector: "#btn" },
      tooltipText: "Click me",
      stepIndex: 1,
      stepTotal: 8,
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "show",
        targetSpec: { type: "css", selector: "#btn" },
        tooltipText: "Click me",
        stepIndex: 1,
        stepTotal: 8,
      })
    );
  });

  test("silently ignores browser.runtime.sendMessage rejection", async () => {
    sendMessageMock.mockRejectedValueOnce(new Error("SW not running"));
    expect(() =>
      sendShowOverlayCommand({
        targetSpec: { type: "a11y", text: "Add" },
        tooltipText: "Add",
        stepIndex: 2,
        stepTotal: 8,
      })
    ).not.toThrow();
    // Allow microtask queue to drain (the rejection is swallowed)
    await Promise.resolve();
  });
});

describe("sendHideOverlayCommand", () => {
  test("calls browser.runtime.sendMessage with ONBOARDING_OVERLAY_COMMAND hide action", () => {
    sendHideOverlayCommand();
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ONBOARDING_OVERLAY_COMMAND",
        action: "hide",
      })
    );
  });

  test("silently ignores browser.runtime.sendMessage rejection", async () => {
    sendMessageMock.mockRejectedValueOnce(new Error("SW not running"));
    expect(() => sendHideOverlayCommand()).not.toThrow();
    await Promise.resolve();
  });
});
