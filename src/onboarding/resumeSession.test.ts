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

import browser from "webextension-polyfill";
import {
  isResumeSnapshot,
  ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY,
  persistOnboardingResumeSnapshot,
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

  test("accepts a boolean advancedKeyFlow and rejects a non-boolean one", () => {
    expect(isResumeSnapshot({ state: "BIOMETRIC_OFFER", advancedKeyFlow: true })).toBe(true);
    expect(isResumeSnapshot({ state: "BIOMETRIC_OFFER", advancedKeyFlow: "yes" })).toBe(false);
  });
});

describe("persistOnboardingResumeSnapshot", () => {
  test("writes safe state to session storage", async () => {
    vi.mocked(browser.storage.session!.set).mockResolvedValue(undefined);
    await persistOnboardingResumeSnapshot({
      state: "ALLOW_GATE",
      email: "e@login.cuny.edu",
      password: "p",
    });
    expect(browser.storage.session!.set).toHaveBeenCalledWith({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "ALLOW_GATE",
        email: "e@login.cuny.edu",
        password: "p",
      },
    });
  });

  test("persists advancedKeyFlow when set", async () => {
    vi.mocked(browser.storage.session!.set).mockResolvedValue(undefined);
    await persistOnboardingResumeSnapshot({
      state: "BIOMETRIC_OFFER",
      email: "e@login.cuny.edu",
      password: "p",
      advancedKeyFlow: true,
    });
    expect(browser.storage.session!.set).toHaveBeenCalledWith({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "BIOMETRIC_OFFER",
        email: "e@login.cuny.edu",
        password: "p",
        advancedKeyFlow: true,
      },
    });
  });

  test("non-resumable state clears session key", async () => {
    vi.mocked(browser.storage.session!.remove).mockResolvedValue(undefined);
    await persistOnboardingResumeSnapshot({
      state: "EXT_PASSWORD_SETUP",
      email: "e@login.cuny.edu",
      password: "p",
    });
    expect(browser.storage.session!.remove).toHaveBeenCalled();
  });
});
