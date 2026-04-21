/**
 * Progress bead header — five pills pinned to the top of the sidebar.
 *
 * Copy and stage mapping are locked by `state.ts` (`BEAD_LABELS`, `STATE_TO_BEAD`).
 * Status resolution (`pending`|`active`|`completed`) lives in `render.ts`
 * (`beadViewModelForState`). This module only paints.
 */

import { beadViewModelForState } from "./render";
import type { OnboardingState } from "./state";

export const BEAD_HEADER_SELECTOR = "[data-onboarding-bead-header='true']";
export const BEAD_ITEM_SELECTOR = "[data-onboarding-bead='true']";

/**
 * Mounts the bead header into `host`. Returns a `renderFor(state)` function so
 * the controller can re-paint on every state change without destroying the
 * container (and without stealing focus from screen-body controls).
 */
export const mountBeadHeader = (
  doc: Document,
  host: HTMLElement
): { renderFor: (state: OnboardingState) => void; unmount: () => void } => {
  const header = doc.createElement("ol");
  header.dataset.onboardingBeadHeader = "true";
  header.setAttribute("aria-label", "Setup progress");
  header.className = "onboarding-bead-header";
  host.appendChild(header);

  const renderFor = (state: OnboardingState): void => {
    const models = beadViewModelForState(state);
    const desired = models.length;
    while (header.childElementCount < desired) {
      const item = doc.createElement("li");
      item.dataset.onboardingBead = "true";
      item.className = "onboarding-bead";
      const dot = doc.createElement("span");
      dot.className = "onboarding-bead-dot";
      dot.setAttribute("aria-hidden", "true");
      const label = doc.createElement("span");
      label.className = "onboarding-bead-label";
      item.appendChild(dot);
      item.appendChild(label);
      header.appendChild(item);
    }
    while (header.childElementCount > desired) {
      header.lastElementChild?.remove();
    }
    Array.from(header.children).forEach((node, index) => {
      const item = node as HTMLElement;
      const model = models[index];
      if (!model) return;
      item.dataset.beadStage = String(model.stage);
      item.dataset.beadStatus = model.status;
      item.setAttribute("aria-current", model.status === "active" ? "step" : "false");
      const label = item.querySelector(".onboarding-bead-label");
      if (label) label.textContent = model.label;
    });
  };

  const unmount = (): void => {
    header.remove();
  };

  return { renderFor, unmount };
};
