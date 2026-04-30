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

describe("mountBeadHeader", () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  test("renders five beads with locked labels from state.ts", () => {
    const { renderFor } = mountBeadHeader(document, host);
    renderFor("WELCOME");

    const beads = host.querySelectorAll(BEAD_ITEM_SELECTOR);
    expect(beads).toHaveLength(5);
    const labels = Array.from(beads).map(
      (b) => b.querySelector(".onboarding-bead-label")?.textContent
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
