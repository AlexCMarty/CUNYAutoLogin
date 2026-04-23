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

export type { CssTarget, A11yTarget, TargetSpec };

const DIM_ATTR = "data-cuny-autologin-overlay";
const HIGHLIGHT_ATTR = "data-cuny-autologin-highlight";
const TOOLTIP_ATTR = "data-cuny-autologin-tooltip";
const CHIP_ATTR = "data-cuny-autologin-step-chip";

export const OVERLAY_TARGET_TIMEOUT_MS = 5000;

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

const resolveTarget = (spec: TargetSpec): Element | null => {
  if (spec.type === "css") return document.querySelector(spec.selector);
  // A11y: find first element with role="menuitem" matching the text exactly.
  // Required for oj-option items that have display:none in the live DOM.
  const items = document.querySelectorAll('[role="menuitem"]');
  for (const el of items) {
    if (el.textContent?.trim() === spec.text) return el;
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
  dimEl.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:2147483640";
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
    "position:fixed;z-index:2147483645;background:#1a1a2e;color:#fff;" +
    "padding:8px 12px;border-radius:6px;font-size:14px;pointer-events:none";
  document.body.appendChild(tooltipEl);
  positionTooltip(el);

  chipEl = document.createElement("div");
  chipEl.setAttribute(CHIP_ATTR, "true");
  chipEl.textContent = `Step ${stepIndex} of ${stepTotal}`;
  chipEl.style.cssText =
    "position:fixed;top:16px;right:16px;z-index:2147483646;background:#fff;" +
    "color:#1a1a2e;padding:4px 10px;border-radius:20px;font-size:12px;" +
    "pointer-events:none";
  document.body.appendChild(chipEl);
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
    const found = resolveTarget(spec);
    if (!found) return;
    clearPending();
    renderOverlay(found, tooltipText, stepIndex, stepTotal);
  });
  pendingObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};
