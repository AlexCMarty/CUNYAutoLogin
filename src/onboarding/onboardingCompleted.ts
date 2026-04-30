/**
 * Local (non-secret) marker: user reached onboarding terminal COMPLETE_DONE.
 * Cleared when the vault is wiped so a fresh onboarding run can start clean.
 */

import browser from "webextension-polyfill";

export const ONBOARDING_V2_COMPLETED_STORAGE_KEY =
  "cunyOnboardingV2CompletedV1" as const;

export async function markOnboardingV2Complete(): Promise<void> {
  try {
    await browser.storage.local.set({
      [ONBOARDING_V2_COMPLETED_STORAGE_KEY]: true,
    });
  } catch {
    // Ignore storage failures.
  }
}

export async function clearOnboardingV2Complete(): Promise<void> {
  try {
    await browser.storage.local.remove(ONBOARDING_V2_COMPLETED_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export async function readOnboardingV2Complete(): Promise<boolean> {
  try {
    const result = await browser.storage.local.get(
      ONBOARDING_V2_COMPLETED_STORAGE_KEY
    );
    return result[ONBOARDING_V2_COMPLETED_STORAGE_KEY] === true;
  } catch {
    return false;
  }
}
