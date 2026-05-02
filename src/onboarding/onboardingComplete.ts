/**
 * Local (non-secret) marker: user reached onboarding terminal COMPLETE_DONE.
 * Cleared when the vault is wiped so a fresh onboarding run can start clean.
 *
 * Reads/writes `cunyOnboardingCompleted`; migrates from legacy
 * `cunyOnboardingV2CompletedV1` on first successful mark.
 */

import browser from "webextension-polyfill";

const ONBOARDING_COMPLETED_STORAGE_KEY = "cunyOnboardingCompleted" as const;

const LEGACY_ONBOARDING_COMPLETED_STORAGE_KEY = "cunyOnboardingV2CompletedV1" as const;

export async function markOnboardingComplete(): Promise<void> {
  try {
    await browser.storage.local.set({
      [ONBOARDING_COMPLETED_STORAGE_KEY]: true,
    });
    await browser.storage.local.remove(LEGACY_ONBOARDING_COMPLETED_STORAGE_KEY);
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[CUNYAutoLogin] markOnboardingComplete: storage failed", error);
    }
  }
}

export async function clearOnboardingComplete(): Promise<void> {
  try {
    await browser.storage.local.remove(ONBOARDING_COMPLETED_STORAGE_KEY);
    await browser.storage.local.remove(LEGACY_ONBOARDING_COMPLETED_STORAGE_KEY);
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[CUNYAutoLogin] clearOnboardingComplete: storage failed", error);
    }
  }
}
