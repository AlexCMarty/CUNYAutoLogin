/**
 * Accessible labels for password visibility toggle buttons — shared across
 * the sidebar vault UI and the onboarding password screens.
 *
 * Lives in a leaf module (no `webextension-polyfill` import) so onboarding
 * tests that mount these screens can avoid pulling the browser polyfill into
 * a Node test environment.
 */

export const SHOW_PASSWORD_LABEL = "Show password";
export const HIDE_PASSWORD_LABEL = "Hide password";
