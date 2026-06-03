import { beforeEach, describe, expect, test, vi } from "vitest";

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
  clearResumeSnapshotSession,
  isResumeSnapshot,
  loadResumeSnapshotFromSession,
  ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY,
  persistOnboardingResumeSnapshot,
  type OnboardingResumeSnapshot,
} from "./resumeSession";

describe("isResumeSnapshot", () => {
  test("accepts minimal resumable snapshot", () => {
    const snap: OnboardingResumeSnapshot = { state: "EMAIL_ENTRY" };
    expect(isResumeSnapshot(snap)).toBe(true);
  });

  test("accepts snapshot with email and password fields", () => {
    expect(
      isResumeSnapshot({
        state: "ALLOW_GATE",
        email: "a@login.cuny.edu",
        password: "pw",
      })
    ).toBe(true);
  });

  test("rejects COMPLETE_DONE (non-resumable)", () => {
    expect(isResumeSnapshot({ state: "COMPLETE_DONE" })).toBe(false);
  });

  test("rejects EXT_PASSWORD_SETUP (non-resumable)", () => {
    expect(isResumeSnapshot({ state: "EXT_PASSWORD_SETUP" })).toBe(false);
  });

  test("rejects WELCOME (non-resumable)", () => {
    expect(isResumeSnapshot({ state: "WELCOME" })).toBe(false);
  });

  test("rejects non-string email field", () => {
    expect(isResumeSnapshot({ state: "EMAIL_ENTRY", email: 42 })).toBe(false);
  });

  test("rejects non-string password field", () => {
    expect(isResumeSnapshot({ state: "EMAIL_ENTRY", password: true })).toBe(false);
  });

  test("rejects non-objects", () => {
    expect(isResumeSnapshot(null)).toBe(false);
    expect(isResumeSnapshot("x")).toBe(false);
    expect(isResumeSnapshot(42)).toBe(false);
    expect(isResumeSnapshot(undefined)).toBe(false);
  });

  test("accepts a boolean advancedKeyFlow and rejects a non-boolean one", () => {
    expect(isResumeSnapshot({ state: "BIOMETRIC_OFFER", advancedKeyFlow: true })).toBe(true);
    expect(isResumeSnapshot({ state: "BIOMETRIC_OFFER", advancedKeyFlow: "yes" })).toBe(false);
  });
});

describe("persistOnboardingResumeSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  test("WELCOME (non-resumable) clears the session key", async () => {
    vi.mocked(browser.storage.session!.remove).mockResolvedValue(undefined);
    await persistOnboardingResumeSnapshot({
      state: "WELCOME",
      email: "",
      password: "",
    });
    expect(browser.storage.session!.remove).toHaveBeenCalled();
    expect(browser.storage.session!.set).not.toHaveBeenCalled();
  });

  test("CREDENTIAL_ERROR maps safe state to PASSWORD_ENTRY before saving", async () => {
    vi.mocked(browser.storage.session!.set).mockResolvedValue(undefined);
    await persistOnboardingResumeSnapshot({
      state: "CREDENTIAL_ERROR",
      email: "e@login.cuny.edu",
      password: "p",
    });
    expect(browser.storage.session!.set).toHaveBeenCalledWith({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: expect.objectContaining({
        state: "PASSWORD_ENTRY",
      }),
    });
  });

  test("storage error in save is swallowed (no thrown exception)", async () => {
    vi.mocked(browser.storage.session!.set).mockRejectedValue(new Error("quota"));
    await expect(
      persistOnboardingResumeSnapshot({
        state: "EMAIL_ENTRY",
        email: "e@login.cuny.edu",
        password: "p",
      })
    ).resolves.toBeUndefined();
  });
});

describe("persistOnboardingResumeSnapshot — advancedKeyFlow:false round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("persists advancedKeyFlow:false explicitly and round-trips to false", async () => {
    // The existing tests only verify advancedKeyFlow:true. When advancedKeyFlow is
    // false the serialized payload must include the field so callers that rely on
    // the exact shape (e.g. loadResumeSnapshotFromSession) see the boolean false,
    // not undefined (Vitest treats {…, advancedKeyFlow: undefined} as equal to {…}
    // so the false case needs an explicit assertion).
    vi.mocked(browser.storage.session!.set).mockResolvedValue(undefined);
    await persistOnboardingResumeSnapshot({
      state: "EMAIL_ENTRY",
      email: "a@login.cuny.edu",
      password: "pw",
      advancedKeyFlow: false,
    });
    expect(browser.storage.session!.set).toHaveBeenCalledWith({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "EMAIL_ENTRY",
        email: "a@login.cuny.edu",
        password: "pw",
        advancedKeyFlow: false,
      },
    });

    // Round-trip: simulate loading back the same payload and verify the
    // restored boolean is false (not undefined or truthy).
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "EMAIL_ENTRY",
        email: "a@login.cuny.edu",
        password: "pw",
        advancedKeyFlow: false,
      },
    });
    const restored = await loadResumeSnapshotFromSession();
    expect(restored).not.toBeNull();
    expect(restored?.advancedKeyFlow).toBe(false);
  });
});

describe("loadResumeSnapshotFromSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns snapshot when session contains a valid resumable entry", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "GUIDED_MANAGE",
        email: "load@login.cuny.edu",
        password: "pw",
      },
    });
    const result = await loadResumeSnapshotFromSession();
    expect(result).toEqual({
      state: "GUIDED_MANAGE",
      email: "load@login.cuny.edu",
      password: "pw",
    });
  });

  test("returns null when session key is absent", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({});
    const result = await loadResumeSnapshotFromSession();
    expect(result).toBeNull();
  });

  test("returns null when stored value fails isResumeSnapshot (non-resumable state)", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: { state: "COMPLETE_DONE" },
    });
    const result = await loadResumeSnapshotFromSession();
    expect(result).toBeNull();
  });

  test("returns null and does not throw when storage.get rejects", async () => {
    vi.mocked(browser.storage.session!.get).mockRejectedValue(new Error("storage unavailable"));
    await expect(loadResumeSnapshotFromSession()).resolves.toBeNull();
  });

  test("returns null when stored email is not a string (email:42)", async () => {
    // The session store is the resume trust boundary: malformed shapes must be
    // rejected so callers always receive a typed snapshot or null.
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "EMAIL_ENTRY",
        email: 42,
      },
    });
    expect(await loadResumeSnapshotFromSession()).toBeNull();
  });

  test("returns null when stored advancedKeyFlow is not a boolean (advancedKeyFlow:\"yes\")", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        state: "EMAIL_ENTRY",
        advancedKeyFlow: "yes",
      },
    });
    expect(await loadResumeSnapshotFromSession()).toBeNull();
  });

  test("returns null when stored object has no state field", async () => {
    vi.mocked(browser.storage.session!.get).mockResolvedValue({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: {
        email: "a@login.cuny.edu",
      },
    });
    expect(await loadResumeSnapshotFromSession()).toBeNull();
  });
});

describe("clearResumeSnapshotSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("calls storage.session.remove with the snapshot key", async () => {
    vi.mocked(browser.storage.session!.remove).mockResolvedValue(undefined);
    await clearResumeSnapshotSession();
    expect(browser.storage.session!.remove).toHaveBeenCalledWith(
      ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY
    );
  });

  test("does not throw when storage.remove rejects", async () => {
    vi.mocked(browser.storage.session!.remove).mockRejectedValue(new Error("remove error"));
    await expect(clearResumeSnapshotSession()).resolves.toBeUndefined();
  });
});
