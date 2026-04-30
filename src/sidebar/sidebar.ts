import { loadResumeSnapshotFromSession } from "../onboarding/resumeSession";
import { loadVaultSessionSnapshot } from "../vaultSession/snapshot";

/**
 * Sidebar entry. Loads the vault UI (`src/popup/popup.ts`) when the student
 * already has a vault and no in-session onboarding resume, so they manage
 * email/password without seeing onboarding WELCOME again.
 *
 * Onboarding mounts when there is no vault yet, when a session resume snapshot
 * exists (mid-flow), or when the dev/e2e `#onboarding=1` hash is set.
 *
 * Dev/e2e `#vault=1` forces the vault form (e2e uses this for setup on a
 * fresh profile; production builds ignore unknown hash params).
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

/** Dev/e2e only: open the vault form even with no stored vault (first-time setup UI). */
const vaultRequestedByDevHash = (): boolean => {
  if (!(DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE)) {
    return false;
  }
  try {
    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    return params.get("vault") === "1";
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

  if (vaultRequestedByDevHash()) {
    document.body.dataset.vaultUi = "sidebar-management";
    await import("../popup/popup");
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
  await import("../popup/popup");
};

await bootSidebar();

if ((DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE)) {
  window.addEventListener("hashchange", () => {
    window.location.reload();
  });
}
