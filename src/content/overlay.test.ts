// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  showOverlay,
  hideOverlay,
  OVERLAY_TARGET_TIMEOUT_MS,
  type TargetSpec,
} from "./overlay";

// ─── helpers ─────────────────────────────────────────────────────────────────

const CSS_TARGET: TargetSpec = { type: "css", selector: "button.allow" };
const A11Y_TARGET: TargetSpec = { type: "a11y", text: "Set as Default" };

const addAllowButton = (): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.className = "allow";
  btn.textContent = "Allow";
  document.body.appendChild(btn);
  return btn;
};

const addMenuitem = (text: string): HTMLElement => {
  const el = document.createElement("span");
  el.setAttribute("role", "menuitem");
  el.textContent = text;
  document.body.appendChild(el);
  return el;
};

beforeEach(() => {
  document.body.innerHTML = "";
  vi.useFakeTimers();
});

afterEach(() => {
  hideOverlay();
  vi.useRealTimers();
});

// ─── render / hide lifecycle ──────────────────────────────────────────────────

describe("showOverlay / hideOverlay lifecycle", () => {
  test("injects dim layer when CSS target is present", () => {
    addAllowButton();
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, vi.fn());
    expect(document.querySelector("[data-cuny-autologin-overlay='true']")).not.toBeNull();
  });

  test("adds highlight attribute to the target element", () => {
    const btn = addAllowButton();
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, vi.fn());
    expect(btn.getAttribute("data-cuny-autologin-highlight")).toBe("true");
  });

  test("renders tooltip with the supplied text", () => {
    addAllowButton();
    showOverlay(CSS_TARGET, "Click Allow to proceed", 1, 1, vi.fn());
    const tooltip = document.querySelector("[data-cuny-autologin-tooltip='true']");
    expect(tooltip?.textContent).toBe("Click Allow to proceed");
  });

  test("renders step chip with 'Step N of M' text", () => {
    addAllowButton();
    showOverlay(CSS_TARGET, "text", 2, 5, vi.fn());
    const chip = document.querySelector("[data-cuny-autologin-step-chip='true']");
    expect(chip?.textContent).toBe("Step 2 of 5");
  });

  test("does not render step chip when stepTotal is 1", () => {
    addAllowButton();
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, vi.fn());
    expect(document.querySelector("[data-cuny-autologin-step-chip='true']")).toBeNull();
  });

  test("hideOverlay removes all injected elements", () => {
    addAllowButton();
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, vi.fn());
    hideOverlay();
    expect(document.querySelector("[data-cuny-autologin-overlay='true']")).toBeNull();
    expect(document.querySelector("[data-cuny-autologin-tooltip='true']")).toBeNull();
    expect(document.querySelector("[data-cuny-autologin-step-chip='true']")).toBeNull();
  });

  test("hideOverlay removes the highlight attribute from the target", () => {
    const btn = addAllowButton();
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, vi.fn());
    hideOverlay();
    expect(btn.hasAttribute("data-cuny-autologin-highlight")).toBe(false);
  });

  test("dim layer has pointer-events:none so target stays clickable", () => {
    addAllowButton();
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, vi.fn());
    const dim = document.querySelector<HTMLDivElement>("[data-cuny-autologin-overlay='true']");
    expect(dim?.style.pointerEvents).toBe("none");
  });

  test("clicking the target auto-hides the overlay", () => {
    const btn = addAllowButton();
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, vi.fn());
    btn.click();
    expect(document.querySelector("[data-cuny-autologin-overlay='true']")).toBeNull();
  });

  test("calling showOverlay twice replaces the first overlay", () => {
    addAllowButton();
    showOverlay(CSS_TARGET, "first", 1, 1, vi.fn());
    showOverlay(CSS_TARGET, "second", 1, 1, vi.fn());
    const tooltips = document.querySelectorAll("[data-cuny-autologin-tooltip='true']");
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0]?.textContent).toBe("second");
  });
});

// ─── CSS target not found fallback ────────────────────────────────────────────

describe("CSS target — missing element fallback", () => {
  test("onNotFound fires after timeout when target is absent", () => {
    const onNotFound = vi.fn();
    showOverlay({ type: "css", selector: "button.missing" }, "text", 1, 1, onNotFound);
    expect(onNotFound).not.toHaveBeenCalled();
    vi.advanceTimersByTime(OVERLAY_TARGET_TIMEOUT_MS);
    expect(onNotFound).toHaveBeenCalledTimes(1);
  });

  test("no dim layer injected while waiting for missing target", () => {
    showOverlay({ type: "css", selector: "button.missing" }, "text", 1, 1, vi.fn());
    expect(document.querySelector("[data-cuny-autologin-overlay='true']")).toBeNull();
  });

  test("onNotFound NOT fired if target appears before timeout", async () => {
    const onNotFound = vi.fn();
    showOverlay({ type: "css", selector: "button.late" }, "text", 1, 1, onNotFound);
    const btn = document.createElement("button");
    btn.className = "late";
    document.body.appendChild(btn);
    // MutationObserver callbacks are queued as microtasks in jsdom.
    // Flush them before advancing the fake timer so clearPending() runs first.
    await Promise.resolve();
    vi.advanceTimersByTime(OVERLAY_TARGET_TIMEOUT_MS);
    expect(onNotFound).not.toHaveBeenCalled();
    expect(document.querySelector("[data-cuny-autologin-overlay='true']")).not.toBeNull();
  });

  test("onNotFound fires only once even after multiple timer ticks", () => {
    const onNotFound = vi.fn();
    showOverlay({ type: "css", selector: "button.missing" }, "text", 1, 1, onNotFound);
    vi.advanceTimersByTime(OVERLAY_TARGET_TIMEOUT_MS * 2);
    expect(onNotFound).toHaveBeenCalledTimes(1);
  });
});

// ─── A11y target ──────────────────────────────────────────────────────────────

describe("A11y target — role=menuitem text match", () => {
  test("highlights menuitem with matching text", () => {
    const item = addMenuitem("Set as Default");
    showOverlay(A11Y_TARGET, "Click it", 1, 1, vi.fn());
    expect(item.getAttribute("data-cuny-autologin-highlight")).toBe("true");
  });

  test("does not match menuitem with different text", () => {
    const item = addMenuitem("Delete Factor");
    showOverlay(A11Y_TARGET, "Click it", 1, 1, vi.fn());
    expect(item.hasAttribute("data-cuny-autologin-highlight")).toBe(false);
  });

  test("matches menuitem case-insensitively (real CUNY renders 'Set As Default')", () => {
    const item = addMenuitem("Set As Default");
    showOverlay(A11Y_TARGET, "Click it", 1, 1, vi.fn());
    expect(item.getAttribute("data-cuny-autologin-highlight")).toBe("true");
  });

  test("onNotFound fires after timeout when no menuitem matches A11y text", () => {
    const onNotFound = vi.fn();
    showOverlay({ type: "a11y", text: "Nonexistent Option" }, "text", 1, 1, onNotFound);
    vi.advanceTimersByTime(OVERLAY_TARGET_TIMEOUT_MS);
    expect(onNotFound).toHaveBeenCalledTimes(1);
  });

  test("does not highlight menuitem with oj-disabled (waits then onNotFound)", () => {
    const item = addMenuitem("Mobile Authenticator - TOTP");
    item.classList.add("oj-disabled");
    const onNotFound = vi.fn();
    showOverlay(
      { type: "a11y", text: "Mobile Authenticator - TOTP" },
      "text",
      1,
      1,
      onNotFound
    );
    vi.advanceTimersByTime(OVERLAY_TARGET_TIMEOUT_MS);
    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(item.hasAttribute("data-cuny-autologin-highlight")).toBe(false);
  });
});

describe("Allow overlay fast-fail on wrong SPA view", () => {
  test("invokes onNotFound immediately when Allow is absent but factor-panel exists", async () => {
    const panel = document.createElement("factor-panel");
    document.body.appendChild(panel);
    const onNotFound = vi.fn();
    showOverlay(
      { type: "css", selector: 'button[onclick="allow()"]' },
      "Allow",
      1,
      1,
      onNotFound
    );
    await Promise.resolve();
    expect(onNotFound).toHaveBeenCalledTimes(1);
  });
});

// ─── anchor placement ─────────────────────────────────────────────────────────

describe("tooltip anchor placement", () => {
  test("tooltip position is below the target bounding rect", () => {
    const btn = addAllowButton();
    // jsdom getBoundingClientRect returns zeros by default; override for this test.
    vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
      top: 100, bottom: 120, left: 50, right: 150,
      width: 100, height: 20, x: 50, y: 100, toJSON: () => ({}),
    });
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, vi.fn());
    const tooltip = document.querySelector<HTMLElement>("[data-cuny-autologin-tooltip='true']");
    expect(tooltip?.style.top).toBe("128px");
    expect(tooltip?.style.left).toBe("50px");
  });
});

// ─── A11y target — button fallback ───────────────────────────────────────────

describe("A11y target — button fallback when no menuitem matches", () => {
  test("highlights a button when no menuitem matches but button text matches", () => {
    const btn = document.createElement("button");
    btn.textContent = "Set as Default";
    document.body.appendChild(btn);
    showOverlay(A11Y_TARGET, "Click it", 1, 1, vi.fn());
    expect(btn.getAttribute("data-cuny-autologin-highlight")).toBe("true");
  });

  test("does not highlight a disabled button (oj-disabled class)", () => {
    const btn = document.createElement("button");
    btn.textContent = "Set as Default";
    btn.classList.add("oj-disabled");
    document.body.appendChild(btn);
    const onNotFound = vi.fn();
    showOverlay(A11Y_TARGET, "Click it", 1, 1, onNotFound);
    expect(btn.hasAttribute("data-cuny-autologin-highlight")).toBe(false);
    vi.advanceTimersByTime(OVERLAY_TARGET_TIMEOUT_MS);
    expect(onNotFound).toHaveBeenCalledTimes(1);
  });

  test("prefers oj-option host element over raw menuitem for highlight", () => {
    const host = document.createElement("oj-option");
    const item = document.createElement("span");
    item.setAttribute("role", "menuitem");
    item.textContent = "Set as Default";
    host.appendChild(item);
    document.body.appendChild(host);
    showOverlay(A11Y_TARGET, "Click it", 1, 1, vi.fn());
    // The oj-option host should be highlighted, not the inner span
    expect(host.getAttribute("data-cuny-autologin-highlight")).toBe("true");
    expect(item.hasAttribute("data-cuny-autologin-highlight")).toBe(false);
  });
});

// ─── CSS target disabled via ancestor ────────────────────────────────────────

describe("CSS target — oj-disabled ancestor makes target invisible", () => {
  test("does not render overlay when CSS target is inside an oj-disabled ancestor", () => {
    const wrapper = document.createElement("div");
    wrapper.classList.add("oj-disabled");
    const btn = document.createElement("button");
    btn.className = "allow";
    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);
    const onNotFound = vi.fn();
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, onNotFound);
    vi.advanceTimersByTime(OVERLAY_TARGET_TIMEOUT_MS);
    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-cuny-autologin-overlay='true']")).toBeNull();
  });
});

// ─── hideOverlay idempotency ──────────────────────────────────────────────────

describe("hideOverlay idempotency", () => {
  test("calling hideOverlay twice does not throw", () => {
    addAllowButton();
    showOverlay(CSS_TARGET, "Click Allow", 1, 1, vi.fn());
    hideOverlay();
    expect(() => hideOverlay()).not.toThrow();
  });

  test("calling hideOverlay without prior showOverlay does not throw", () => {
    expect(() => hideOverlay()).not.toThrow();
  });
});

// ─── Allow overlay fast-fail — Allow present but factor-panel absent ──────────

describe("Allow overlay — no fast-fail when factor-panel is absent", () => {
  test("renders normally for allow-gate selector when factor-panel is absent", () => {
    const btn = document.createElement("button");
    btn.setAttribute("onclick", "allow()");
    document.body.appendChild(btn);
    showOverlay(
      { type: "css", selector: 'button[onclick="allow()"]' },
      "Allow",
      1,
      1,
      vi.fn()
    );
    expect(document.querySelector("[data-cuny-autologin-overlay='true']")).not.toBeNull();
  });
});
