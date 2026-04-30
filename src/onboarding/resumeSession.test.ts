import { describe, expect, test, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      session: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
  },
}));

import {
  isResumeSnapshot,
  type OnboardingResumeSnapshot,
} from "./resumeSession";

describe("isResumeSnapshot", () => {
  test("accepts minimal resumable snapshot", () => {
    const snap: OnboardingResumeSnapshot = { state: "EMAIL_ENTRY" };
    expect(isResumeSnapshot(snap)).toBe(true);
  });

  test("rejects COMPLETE_DONE", () => {
    expect(isResumeSnapshot({ state: "COMPLETE_DONE" })).toBe(false);
  });

  test("rejects non-objects", () => {
    expect(isResumeSnapshot(null)).toBe(false);
    expect(isResumeSnapshot("x")).toBe(false);
  });
});
