/**
 * Session-only onboarding resume snapshot. Shared by sidebar boot and
 * onboarding render so the storage key and validation stay in sync.
 */

import browser from "webextension-polyfill";
import {
  type OnboardingState,
  isResumableState,
  safeResumeStateFor,
} from "./state";

export const ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY =
  "cunyOnboardingResumeSnapshot" as const;

export type OnboardingResumeSnapshot = {
  readonly state: OnboardingState;
  readonly email?: string;
  readonly password?: string;
  readonly advancedKeyFlow?: boolean;
};

export const isResumeSnapshot = (
  value: unknown
): value is OnboardingResumeSnapshot => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    !(
      typeof record.state === "string" &&
      isResumableState(record.state as OnboardingState)
    )
  ) {
    return false;
  }
  if (record.email !== undefined && typeof record.email !== "string") return false;
  if (record.password !== undefined && typeof record.password !== "string")
    return false;
  if (
    record.advancedKeyFlow !== undefined &&
    typeof record.advancedKeyFlow !== "boolean"
  ) {
    return false;
  }
  return true;
};

const warnResumeSnapshotFailure = (context: string, error: unknown): void => {
  if (import.meta.env.MODE !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[CUNYAutoLogin] resumeSession: ${context}`, error);
  }
};

export async function loadResumeSnapshotFromSession(): Promise<OnboardingResumeSnapshot | null> {
  try {
    const result = await browser.storage.session?.get(
      ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY
    );
    const fresh = result?.[ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY];
    if (isResumeSnapshot(fresh)) return fresh;
    return null;
  } catch (error) {
    warnResumeSnapshotFailure("load failed", error);
    return null;
  }
}

export async function clearResumeSnapshotSession(): Promise<void> {
  try {
    await browser.storage.session?.remove(ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY);
  } catch (error) {
    warnResumeSnapshotFailure("clear failed", error);
  }
}

async function saveResumeSnapshotSession(
  payload: OnboardingResumeSnapshot
): Promise<void> {
  try {
    await browser.storage.session?.set({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: payload,
    });
  } catch (error) {
    warnResumeSnapshotFailure("save failed", error);
  }
}

/**
 * Writes the controller snapshot to `storage.session` using the same
 * safe-state policy as the sidebar debounce path. Used from the sidebar while
 * it is alive and from the service worker when flushing during sidebar unload
 * (the extension page can be destroyed before an in-flight `storage.session`
 * write from that document finishes).
 */
export async function persistOnboardingResumeSnapshot(snapshot: {
  readonly state: OnboardingState;
  readonly email: string;
  readonly password: string;
  readonly advancedKeyFlow?: boolean;
}): Promise<void> {
  const safeState = safeResumeStateFor(snapshot.state);
  if (!safeState) {
    await clearResumeSnapshotSession();
    return;
  }
  await saveResumeSnapshotSession({
    state: safeState,
    email: snapshot.email,
    password: snapshot.password,
    advancedKeyFlow: snapshot.advancedKeyFlow,
  });
}
