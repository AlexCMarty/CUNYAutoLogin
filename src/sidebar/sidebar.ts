import { ONBOARDING_V2_ENABLED } from "../onboarding/state";

/**
 * Sidebar entry. By default this delegates to the legacy vault UI
 * (`src/popup/popup.ts`) so setup/locked/unlocked behavior is unchanged.
 *
 * When `ONBOARDING_V2_ENABLED` is flipped on (plan-12 launch), the sidebar
 * boots the new screen-based onboarding renderer instead.
 *
 * Test-only escape hatch: in development-mode builds (`build:dev` / `build:e2e`,
 * both of which run `vite build --mode development`), the presence of
 * `#onboarding=1` in the URL hash will also boot the onboarding renderer. This
 * lets Playwright exercise plan-04+ screens without flipping the compile-time
 * feature flag. `import.meta.env.MODE` is statically replaced by Vite at build
 * time with the `--mode` string, so the whole branch folds away to `return
 * false` in production builds and there is no URL-based override surface on
 * anything shipped to users. (Unlike `import.meta.env.DEV`, which Vite ties
 * to `command === "serve"`, `MODE` honors our `--mode development` flag.)
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
  if (ONBOARDING_V2_ENABLED || onboardingRequestedByDevHash()) {
    const { mountOnboarding } = await import("../onboarding/render");
    mountOnboarding(document);
    return;
  }
  await import("../popup/popup");
};

void bootSidebar();

/**
 * Dev/e2e escape hatch: if the URL hash changes after initial boot (e.g. the
 * sidebar was opened via toolbar action, then a test navigates it to
 * `#onboarding=1`), reload the page so `bootSidebar()` re-runs and the
 * onboarding shell mounts. Folds away in production via the MODE check.
 */
if ((DEV_MODE_NAMES as readonly string[]).includes(import.meta.env.MODE)) {
  window.addEventListener("hashchange", () => {
    window.location.reload();
  });
}
