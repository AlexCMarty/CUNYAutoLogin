import { loadResumeSnapshotFromSession } from "../onboarding/resumeSession";
import { ONBOARDING_V2_ENABLED } from "../onboarding/state";
import { loadVaultSessionSnapshot } from "../vaultSession/snapshot";

/**
 * Sidebar entry. Delegates to the legacy vault UI (`src/popup/popup.ts`) when
 * the student already has a vault and no in-session onboarding resume, so they
 * manage email/password without seeing onboarding WELCOME again.
 *
 * Onboarding v2 mounts when there is no vault yet, when a session resume
 * snapshot exists (mid-flow), or when the dev/e2e `#onboarding=1` hash is set.
 */

const DEV_MODE_NAMES = ["development", "e2e"] as const;

const onboardingRequestedByDevHash = (): boolean => {
  if (!(DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE)) {
    return false;
  }
  try {
    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    return params.get("onboarding") === "1";
  } catch {
    return false;
  }
};

const bootSidebar = async (): Promise<void> => {
  if (onboardingRequestedByDevHash()) {
    const { mountOnboarding } = await import("../onboarding/render");
    mountOnboarding(document);
    return;
  }

  if (!ONBOARDING_V2_ENABLED) {
    await import("../popup/popup");
    return;
  }

  const snap = await loadVaultSessionSnapshot();
  if (!snap.storedVault) {
    const { mountOnboarding } = await import("../onboarding/render");
    mountOnboarding(document);
    return;
  }

  const resume = await loadResumeSnapshotFromSession();
  if (resume) {
    const { mountOnboarding } = await import("../onboarding/render");
    mountOnboarding(document);
    return;
  }

  document.body.dataset.vaultUi = "sidebar-management";
  await import("../popup/popup");
};

void bootSidebar();

if ((DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE)) {
  window.addEventListener("hashchange", () => {
    window.location.reload();
  });
}
