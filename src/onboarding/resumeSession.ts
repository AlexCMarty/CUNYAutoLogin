/**
 * Session-only onboarding resume snapshot. Shared by sidebar boot and
 * onboarding render so the storage key and validation stay in sync.
 */

import browser from "webextension-polyfill";
import {
  type OnboardingState,
  isResumableState,
} from "./state";

export const ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY =
  "cunyOnboardingResumeSnapshot" as const;

/** @internal Legacy key — read during load; removed when saving a new snapshot. */
export const LEGACY_ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY =
  "cunyOnboardingResumeSnapshotV1" as const;

export type OnboardingResumeSnapshot = {
  readonly state: OnboardingState;
  readonly email?: string;
  readonly password?: string;
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
  return true;
};

export async function loadResumeSnapshotFromSession(): Promise<OnboardingResumeSnapshot | null> {
  try {
    const result = await browser.storage.session?.get([
      ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY,
      LEGACY_ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY,
    ]);
    const fresh = result?.[ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY];
    const legacy = result?.[LEGACY_ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY];
    if (isResumeSnapshot(fresh)) return fresh;
    if (isResumeSnapshot(legacy)) return legacy;
    return null;
  } catch {
    return null;
  }
}

export async function clearResumeSnapshotSession(): Promise<void> {
  try {
    await browser.storage.session?.remove(ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY);
    await browser.storage.session?.remove(LEGACY_ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY);
  } catch {
    // Ignore when session storage is unavailable.
  }
}

export async function saveResumeSnapshotSession(
  payload: OnboardingResumeSnapshot
): Promise<void> {
  try {
    await browser.storage.session?.set({
      [ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY]: payload,
    });
    await browser.storage.session?.remove(LEGACY_ONBOARDING_RESUME_SNAPSHOT_SESSION_KEY);
  } catch {
    // Ignore when session storage is unavailable.
  }
}
