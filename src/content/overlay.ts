/**
 * Plan-06: overlay engine for guided CUNY onboarding steps.
 *
 * Injects a dim layer, highlight ring, tooltip, and step chip into the current
 * page. The dim layer uses pointer-events:none so the highlighted target stays
 * fully clickable.
 *
 * Two target patterns are supported:
 *   CssTarget — element found via document.querySelector
 *   A11yTarget — element found via role="menuitem" text match (required for
 *                oj-option items which have display:none in the live DOM but
 *                are reachable via the accessibility tree snapshot)
 *
 * If the target is not found within OVERLAY_TARGET_TIMEOUT_MS the caller's
 * onNotFound callback fires so the sidebar can surface a recovery message.
 */

import type { CssTarget, A11yTarget, TargetSpec } from "../onboarding/messages";
import {
  CUNY_ALLOW_GATE_BTN_SELECTOR,
  OVERLAY_TARGET_TIMEOUT_MS,
} from "../cuny/ssoSite";

export type { CssTarget, A11yTarget, TargetSpec };
export { OVERLAY_TARGET_TIMEOUT_MS };

const DIM_ATTR = "data-cuny-autologin-overlay";
const HIGHLIGHT_ATTR = "data-cuny-autologin-highlight";
const TOOLTIP_ATTR = "data-cuny-autologin-tooltip";
const CHIP_ATTR = "data-cuny-autologin-step-chip";

const OVERLAY_DIM_Z_INDEX     = 2_147_483_640;
const OVERLAY_TOOLTIP_Z_INDEX = 2_147_483_645;
const OVERLAY_CHIP_Z_INDEX    = 2_147_483_646;

let dimEl: HTMLDivElement | null = null;
let tooltipEl: HTMLDivElement | null = null;
let chipEl: HTMLDivElement | null = null;
let highlightedEl: Element | null = null;
let clickHandler: (() => void) | null = null;
let pendingObserver: MutationObserver | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

const clearPending = (): void => {
  if (pendingObserver) {
    pendingObserver.disconnect();
    pendingObserver = null;
  }
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
};

export const hideOverlay = (): void => {
  clearPending();
  dimEl?.remove();
  dimEl = null;
  tooltipEl?.remove();
  tooltipEl = null;
  chipEl?.remove();
  chipEl = null;
  if (highlightedEl) {
    if (clickHandler) {
      highlightedEl.removeEventListener("click", clickHandler);
      clickHandler = null;
    }
    highlightedEl.removeAttribute(HIGHLIGHT_ATTR);
    highlightedEl = null;
  }
};

const isDisabledOverlayTarget = (el: Element): boolean =>
  el.classList.contains("oj-disabled") || el.closest(".oj-disabled") !== null;

const resolveTarget = (spec: TargetSpec): Element | null => {
  if (spec.type === "css") {
    const el = document.querySelector(spec.selector);
    if (!el) return null;
    if (isDisabledOverlayTarget(el)) return null;
    return el;
  }
  // A11y: find first element matching the text exactly.
  // Checks [role="menuitem"] first (required for oj-option items that have
  // display:none in the live DOM), then falls back to plain button elements
  // (required for JET buttons that render without IDs, e.g. "Verify Now").
  const textLower = spec.text.toLowerCase();
  const menuItems = document.querySelectorAll('[role="menuitem"]');
  for (const el of menuItems) {
    if (el.textContent?.trim().toLowerCase() !== textLower) continue;
    if (isDisabledOverlayTarget(el)) return null;
    // Prefer the oj-option host so e2e can assert on #ChallengeOMATOTP.
    const host = el.closest("oj-option");
    return host ?? el;
  }
  const buttons = document.querySelectorAll("button");
  for (const el of buttons) {
    if (el.textContent?.trim().toLowerCase() !== textLower) continue;
    if (isDisabledOverlayTarget(el)) return null;
    return el;
  }
  return null;
};

const positionTooltip = (anchor: Element): void => {
  if (!tooltipEl) return;
  const rect = anchor.getBoundingClientRect();
  tooltipEl.style.top = `${Math.max(0, rect.bottom + 8)}px`;
  tooltipEl.style.left = `${Math.max(0, rect.left)}px`;
};

const renderOverlay = (
  el: Element,
  tooltipText: string,
  stepIndex: number,
  stepTotal: number
): void => {
  // Dim layer — pointer-events:none so the target remains clickable
  dimEl = document.createElement("div");
  dimEl.setAttribute(DIM_ATTR, "true");
  dimEl.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:${OVERLAY_DIM_Z_INDEX}`;
  dimEl.style.pointerEvents = "none";
  document.body.appendChild(dimEl);

  el.setAttribute(HIGHLIGHT_ATTR, "true");
  highlightedEl = el;

  // Auto-hide when student clicks the highlighted target
  clickHandler = (): void => hideOverlay();
  el.addEventListener("click", clickHandler, { once: true });

  tooltipEl = document.createElement("div");
  tooltipEl.setAttribute(TOOLTIP_ATTR, "true");
  tooltipEl.textContent = tooltipText;
  tooltipEl.style.cssText =
    `position:fixed;z-index:${OVERLAY_TOOLTIP_Z_INDEX};background:#1a1a2e;color:#fff;` +
    "padding:8px 12px;border-radius:6px;font-size:14px;pointer-events:none";
  document.body.appendChild(tooltipEl);
  positionTooltip(el);

  // Only show the chip when there are multiple steps — "Step 1 of 1" is noise.
  if (stepTotal > 1) {
    chipEl = document.createElement("div");
    chipEl.setAttribute(CHIP_ATTR, "true");
    chipEl.textContent = `Step ${stepIndex} of ${stepTotal}`;
    chipEl.style.cssText =
      `position:fixed;top:16px;right:16px;z-index:${OVERLAY_CHIP_Z_INDEX};background:#fff;` +
      "color:#1a1a2e;padding:4px 10px;border-radius:20px;font-size:12px;" +
      "pointer-events:none";
    document.body.appendChild(chipEl);
  }
};

/**
 * Show the overlay pointing at the given target. If the target is not in the
 * DOM yet, waits for it via MutationObserver. If it never appears within
 * OVERLAY_TARGET_TIMEOUT_MS, calls onNotFound so the sidebar can recover.
 */
export const showOverlay = (
  spec: TargetSpec,
  tooltipText: string,
  stepIndex: number,
  stepTotal: number,
  onNotFound: () => void
): void => {
  hideOverlay();

  // If the sidebar still thinks we are on Allow but the tab already advanced to
  // factors-list, fail fast so the allow-gate recovery screen can show before
  // `factors_list` posts and replaces it (which would cancel the 5s timer).
  if (
    spec.type === "css" &&
    spec.selector === CUNY_ALLOW_GATE_BTN_SELECTOR &&
    !document.querySelector(CUNY_ALLOW_GATE_BTN_SELECTOR) &&
    document.querySelector("factor-panel")
  ) {
    queueMicrotask(() => onNotFound());
    return;
  }

  const el = resolveTarget(spec);
  if (el) {
    renderOverlay(el, tooltipText, stepIndex, stepTotal);
    return;
  }

  pendingTimer = setTimeout(() => {
    clearPending();
    onNotFound();
  }, OVERLAY_TARGET_TIMEOUT_MS);

  pendingObserver = new MutationObserver(() => {
    const resolvedTarget = resolveTarget(spec);
    if (!resolvedTarget) return;
    clearPending();
    renderOverlay(resolvedTarget, tooltipText, stepIndex, stepTotal);
  });
  pendingObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};
