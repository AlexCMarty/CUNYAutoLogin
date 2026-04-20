import { ONBOARDING_V2_ENABLED } from "../onboarding/state";

/**
 * Sidebar entry. By default this delegates to the legacy vault UI
 * (`src/popup/popup.ts`) so setup/locked/unlocked behavior is unchanged.
 *
 * When `ONBOARDING_V2_ENABLED` is flipped on (plan-04+), the sidebar boots the
 * new screen-based onboarding renderer instead. The feature toggle is a
 * compile-time constant so the legacy path stays tree-shakeable and the
 * onboarding skeleton has no side effects on production builds today.
 */
const bootSidebar = async (): Promise<void> => {
  if (ONBOARDING_V2_ENABLED) {
    const { mountOnboarding } = await import("../onboarding/render");
    mountOnboarding(document);
    return;
  }
  await import("../popup/popup");
};

void bootSidebar();
