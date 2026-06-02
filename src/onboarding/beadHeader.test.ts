// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

// beadHeader → render.ts → emailEntry.ts → sidebar.utils.ts (which imports
// webextension-polyfill at module load). Stub the polyfill to keep jsdom happy.
vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    },
    runtime: { sendMessage: vi.fn() },
  },
}));

import {
  BEAD_HEADER_SELECTOR,
  BEAD_ITEM_SELECTOR,
  mountBeadHeader,
} from "./beadHeader";

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

describe("mountBeadHeader — rendering and state", () => {
  test("renders five beads with locked labels from state.ts", () => {
    const { renderFor } = mountBeadHeader(document, host);
    renderFor("WELCOME");

    const beads = host.querySelectorAll(BEAD_ITEM_SELECTOR);
    expect(beads).toHaveLength(5);
    const labels = Array.from(beads).map(
      (bead) => bead.querySelector(".onboarding-bead-label")?.textContent
    );
    expect(labels).toEqual([
      "Your info",
      "First login",
      "Set up login codes",
      "Extension password",
      "Done",
    ]);
  });

  test("bead 1 is active on screens 1-3 and others are pending", () => {
    const { renderFor } = mountBeadHeader(document, host);
    for (const state of ["WELCOME", "EMAIL_ENTRY", "PASSWORD_ENTRY"] as const) {
      renderFor(state);
      const beads = Array.from(
        host.querySelectorAll<HTMLElement>(BEAD_ITEM_SELECTOR)
      );
      expect(beads[0]?.dataset.beadStatus).toBe("active");
      expect(beads[0]?.getAttribute("aria-current")).toBe("step");
      for (let i = 1; i < beads.length; i++) {
        expect(beads[i]?.dataset.beadStatus).toBe("pending");
      }
    }
  });

  test("bead 1 flips to completed once state advances to OPENING_CUNY", () => {
    const { renderFor } = mountBeadHeader(document, host);
    renderFor("OPENING_CUNY");
    const beads = Array.from(
      host.querySelectorAll<HTMLElement>(BEAD_ITEM_SELECTOR)
    );
    expect(beads[0]?.dataset.beadStatus).toBe("completed");
    expect(beads[1]?.dataset.beadStatus).toBe("active");
    expect(beads[2]?.dataset.beadStatus).toBe("pending");
  });

  test("unmount removes the header from the DOM", () => {
    const { renderFor, unmount } = mountBeadHeader(document, host);
    renderFor("WELCOME");
    expect(host.querySelector(BEAD_HEADER_SELECTOR)).not.toBeNull();
    unmount();
    expect(host.querySelector(BEAD_HEADER_SELECTOR)).toBeNull();
  });

  test("renderFor is idempotent and reuses existing bead elements", () => {
    const { renderFor } = mountBeadHeader(document, host);
    renderFor("WELCOME");
    const firstBead = host.querySelector(BEAD_ITEM_SELECTOR);
    renderFor("EMAIL_ENTRY");
    const stillFirstBead = host.querySelector(BEAD_ITEM_SELECTOR);
    expect(firstBead).toBe(stillFirstBead);
  });
});

describe("mountBeadHeader — bead attributes", () => {
  test("each bead element has data-bead-stage matching its 1-based index", () => {
    const { renderFor } = mountBeadHeader(document, host);
    renderFor("WELCOME");
    const beads = Array.from(
      host.querySelectorAll<HTMLElement>(BEAD_ITEM_SELECTOR)
    );
    beads.forEach((bead, index) => {
      expect(bead.dataset.beadStage).toBe(String(index + 1));
    });
  });

  test("non-active beads have aria-current=false", () => {
    const { renderFor } = mountBeadHeader(document, host);
    renderFor("WELCOME");
    const beads = Array.from(
      host.querySelectorAll<HTMLElement>(BEAD_ITEM_SELECTOR)
    );
    // Bead 1 is active on WELCOME; beads 2-5 should have aria-current=false
    for (let i = 1; i < beads.length; i++) {
      expect(beads[i]?.getAttribute("aria-current")).toBe("false");
    }
  });

  test("active bead has aria-current=step", () => {
    const { renderFor } = mountBeadHeader(document, host);
    renderFor("WELCOME");
    const beads = Array.from(
      host.querySelectorAll<HTMLElement>(BEAD_ITEM_SELECTOR)
    );
    expect(beads[0]?.getAttribute("aria-current")).toBe("step");
  });

  test("dot element has --bead-stage CSS custom property set", () => {
    const { renderFor } = mountBeadHeader(document, host);
    renderFor("WELCOME");
    const beads = Array.from(
      host.querySelectorAll<HTMLElement>(BEAD_ITEM_SELECTOR)
    );
    beads.forEach((bead, index) => {
      const dot = bead.querySelector<HTMLElement>(".onboarding-bead-dot");
      expect(dot?.style.getPropertyValue("--bead-stage")).toBe(`"${index + 1}"`);
    });
  });

  test("all beads 1-4 are completed and bead 5 is active on COMPLETE_DONE", () => {
    const { renderFor } = mountBeadHeader(document, host);
    renderFor("COMPLETE_DONE");
    const beads = Array.from(
      host.querySelectorAll<HTMLElement>(BEAD_ITEM_SELECTOR)
    );
    for (let i = 0; i < 4; i++) {
      expect(beads[i]?.dataset.beadStatus).toBe("completed");
    }
    expect(beads[4]?.dataset.beadStatus).toBe("active");
  });

  test("header element has aria-label Setup progress", () => {
    mountBeadHeader(document, host);
    const header = host.querySelector<HTMLElement>(BEAD_HEADER_SELECTOR);
    expect(header?.getAttribute("aria-label")).toBe("Setup progress");
  });
});
