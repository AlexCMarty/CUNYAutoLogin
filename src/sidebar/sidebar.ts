import { DEV_MODE_NAMES } from "../onboarding/devModes";
import { tryParseDevQaOnboardingJumpFromWindow } from "../onboarding/devQaJump";
import {
  clearResumeSnapshotSession,
  loadResumeSnapshotFromSession,
} from "../onboarding/resumeSession";
import { loadVaultSessionSnapshot } from "../vaultSession/snapshot";

/**
 * Sidebar entry. Loads the vault UI (`src/sidebar/vaultController.ts`) when the student
 * already has a vault and no in-session onboarding resume, so they manage
 * email/password without seeing onboarding WELCOME again.
 *
 * Onboarding mounts when there is no vault yet, when a session resume snapshot
 * exists (mid-flow), or when the dev/e2e `#onboarding=1` hash is set.
 *
 * Dev/e2e `#qa=<STATE>` jumps to a mounted onboarding screen for visual QA
 * (extension-live-testing skill). Session resume is cleared first.
 */

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
  const qaJump = tryParseDevQaOnboardingJumpFromWindow(import.meta.env.MODE);
  if (qaJump !== null) {
    await clearResumeSnapshotSession();
    const { mountOnboarding } = await import("../onboarding/render");
    mountOnboarding(document, { qaJump });
    return;
  }

  if (onboardingRequestedByDevHash()) {
    const { mountOnboarding } = await import("../onboarding/render");
    mountOnboarding(document);
    return;
  }

  // Do not gate this flow behind a compile-time boolean: esbuild can fold a
  // constant `false` branch and drop the live vault snapshot / resume path from the bundle.

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
  await import("./vaultController");
};

await bootSidebar();

if ((DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE)) {
  window.addEventListener("hashchange", () => {
    window.location.reload();
  });
}
