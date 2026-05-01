/**
 * CUNY Oracle SSO page contract: URL path fragments, DOM ids, and TOTP UI strings.
 * CUNY may change these without notice — keep this module the single source of truth.
 *
 * Manifest `host_permissions` and `content_scripts.matches` in `src/manifest.json` must
 * use the same host as `SSO_LOGIN_HOST` (with `https://` and `/*` as appropriate).
 */

/** Host only (no scheme). Must stay in sync with `manifest.json` host patterns. */
export const SSO_LOGIN_HOST = "ssologin.cuny.edu" as const;

export const SSO_LOGIN_ORIGIN = `https://${SSO_LOGIN_HOST}` as const;

/** Saved vault email must use CUNY’s login email domain. */
export const LOGIN_EMAIL_SUFFIX = "@login.cuny.edu" as const;

/**
 * Path substrings for the username/password Oracle SSO page. A URL matching any of
 * these gets credential auto-fill.
 * - `obrareq.cgi`: typical redirect from CUNYFirst, Degreeworks, etc.
 * - `samlv20`: redirect from Brightspace; same form as obrareq but different path.
 */
export const CREDENTIAL_PAGE_PATH_MARKERS = [
  "/oam/server/obrareq.cgi",
  "/oamfed/idp/samlv20",
] as const;

/** Path substring for the second-factor TOTP entry page. */
export const TOTP_PAGE_PATH_MARKER = "/oaa-totp-factor/" as const;

/**
 * Entry point the onboarding Screen 4 opens in a new tab. Hitting this URL
 * unauthenticated redirects through CUNY's SSO flow to the credential page,
 * which is exactly the starting point the content script expects.
 */
export const CUNY_LOGIN_ENTRY_URL =
  `${SSO_LOGIN_ORIGIN}/oaa/rui` as const;

/**
 * Path CUNY redirects to when username/password submission is rejected. Having
 * the browser end up here — while still on the SSO origin — is our primary
 * signal for wrong-credential detection. Secondary signal is the
 * `#serverError` alert element (which also appears on re-renders without a
 * full navigation).
 */
export const CREDENTIAL_ERROR_URL_PATH = "/oam/server/auth_cred_submit" as const;

/** Oracle's error-message container on the credential page (role=alert). */
export const CREDENTIAL_ERROR_ELEMENT_ID = "serverError" as const;

/**
 * Substring (case-insensitive) that appears in the Oracle wrong-credential
 * alert. Used alongside the element id so ephemeral error elements added for
 * non-credential reasons don't trigger the CREDENTIAL_ERROR branch.
 */
export const CREDENTIAL_ERROR_TEXT_MARKER =
  "Incorrect Username or Password" as const;

export const matchesCredentialPage = (url: string): boolean =>
  CREDENTIAL_PAGE_PATH_MARKERS.some((marker) => url.includes(marker));

export const matchesCredentialErrorUrl = (url: string): boolean =>
  url.includes(CREDENTIAL_ERROR_URL_PATH);

export const matchesTotpPage = (url: string): boolean =>
  url.includes(TOTP_PAGE_PATH_MARKER);

/**
 * Path substring for the Oracle RUI “add authentication method” flow where the IdP
 * shows the TOTP shared secret (e.g. …/oaa/rui/index.html).
 */
export const TOTP_ENROLL_PAGE_PATH_MARKER = "/oaa/rui/" as const;

export const matchesTotpEnrollPage = (url: string): boolean =>
  url.includes(TOTP_ENROLL_PAGE_PATH_MARKER);

/**
 * MFA Self-Service “verify new TOTP factor” step: same path as other RUI screens, but `h_ra=1`
 * identifies the post-enrollment verification UI. Match pathname + query so local E2E fixtures
 * (e.g. http://127.0.0.1:4173/…) behave like production.
 */
export const RUI_MFA_ENROLL_VERIFY_PAGE_URL =
  `${SSO_LOGIN_ORIGIN}/oaa/rui/index.html?h_ra=1` as const;

const RUI_MFA_ENROLL_VERIFY_PATH = "/oaa/rui/index.html" as const;

export function matchesRuiMfaEnrollVerifyPage(url: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }
  return (
    parsedUrl.pathname === RUI_MFA_ENROLL_VERIFY_PATH &&
    parsedUrl.searchParams.get("h_ra") === "1"
  );
}

/** OTP input on that step (`id` contains `|` — use getElementById). */
export const RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID = "otp|input" as const;

/** How often the content script looks for the verify OTP field (SPA injects it late). */
export const RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS = 500;

/**
 * `aria-labelledby` value on the element that displays the Base32 secret. Use inside
 * quoted attribute selectors so `|` is literal, e.g.
 * `[aria-labelledby="${TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY}"]`.
 */
export const TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY = "key-labelled-by|label" as const;

/** Session storage key for the master password (held only for the browser session lifetime). */
export const SESSION_MASTER_KEY = "cunySessionMaster" as const;

/** Session-only staging for a secret scraped from the enroll page (sidebar vault controller consumes + clears). */
export const PENDING_TOTP_SECRET_SESSION_KEY = "cunyPendingTotpSecretFromSso" as const;

/** Login form element ids on the credential page (Oracle JET). */
export const CREDENTIAL_INPUT_IDS = {
  username: "CUNYLoginUsernameDisplay",
  password: "CUNYLoginPassword",
  submitButton: "submit",
} as const;

/** Literal element id on the TOTP page (includes `|` — use getElementById, not querySelector). */
export const TOTP_OTP_INPUT_ID = "otpValue|input" as const;

/** Substring matched against button `innerHTML` to find the Verify control. */
export const TOTP_VERIFY_BUTTON_LABEL = "Verify" as const;

/** Parameters for TOTP codes (must match what CUNY’s IdP expects). */
export const TOTP_GENERATION_OPTIONS = {
  algorithm: "SHA-1" as const,
  digits: 6,
  period: 30,
};

/** Min/max length for a Base32 secret after stripping separators (CUNY typically ~32 chars). */
export const TOTP_SECRET_LEN_MIN = 10;
export const TOTP_SECRET_LEN_MAX = 128;

/**
 * Normalizes and validates a raw Base32 TOTP secret candidate.
 * Strips whitespace, uppercases, removes trailing padding, then checks length and alphabet.
 * Returns the normalized string on success, or null if the input is not a valid Base32 secret.
 */
export function normalizeTotpSecretCandidate(raw: string): string | null {
  const normalized = raw.replace(/\s+/g, "").toUpperCase().replace(/=+$/, "");
  if (normalized.length < TOTP_SECRET_LEN_MIN || normalized.length > TOTP_SECRET_LEN_MAX) {
    return null;
  }
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

// ── Allow-gate ────────────────────────────────────────────────────────────────

/** The allow-gate button selector used across overlay, reporter, and screen modules. */
export const CUNY_ALLOW_GATE_BTN_SELECTOR = 'button[onclick="allow()"]' as const;

// ── Oracle RUI / JET selectors ─────────────────────────────────────────────────

/** Container element for each enrolled factor in the RUI SPA. */
export const RUI_FACTOR_PANEL_SELECTOR = "factor-panel" as const;

/** Option element for the CUNY TOTP challenge type in the RUI add-factor flow. */
export const RUI_TOTP_OPTION_SELECTOR = "oj-option#ChallengeOMATOTP" as const;

/** Kebab/actions button on a factor panel (smaller variant). */
export const RUI_KEBAB_BTN_SELECTOR = "oj-menu-button.oj-button-sm" as const;

/** Button inside the add-factor or set-default menu. */
export const RUI_KEBAB_MENU_BTN_SELECTOR = "oj-menu-button.menu-button button" as const;

/** Trigger button for the add-factor / set-default dropdown menu. */
export const RUI_ADD_MENU_SELECTOR = "oj-menu-button.menu-button" as const;

/** Name input field id when setting the TOTP factor alias (contains `|` — use getElementById). */
export const RUI_FACTOR_NAME_INPUT_ID = "name|input" as const;

/** Oracle inline validation error container shown on failed OTP submission. */
export const RUI_MFA_INLINE_ERROR_SELECTOR =
  ".oj-messaging-inline-container .oj-message-detail" as const;

// ── RUI text markers ───────────────────────────────────────────────────────────

/** Button label for the final verify-and-save step in the MFA enroll-verify flow. */
export const RUI_VERIFY_BTN_LABEL = "Verify and Save" as const;

/** Client-side validation text shown when OTP field is empty. */
export const RUI_CLIENT_OTP_ERROR = "Enter a OTP code" as const;

/** Server-side error text shown when the submitted OTP is wrong. */
export const RUI_SERVER_OTP_ERROR = "Incorrect code" as const;

// ── Timing ─────────────────────────────────────────────────────────────────────

/** How often the overlay is refreshed while the TOTP enroll page is open. */
export const ENROLL_OVERLAY_REFRESH_INTERVAL_MS = 600;

/** Poll interval for the guided RUI onboarding SPA state checks. */
export const RUI_ONBOARDING_POLL_INTERVAL_MS = 400;

/** How long the overlay engine waits for a target element to appear in the DOM. */
export const OVERLAY_TARGET_TIMEOUT_MS = 5_000;

/** Default timeout for waiting on a generic DOM element to appear. */
export const WAIT_FOR_ELEMENT_TIMEOUT_MS = 10_000;

/** Extended timeout for waiting on the TOTP secret element during enrollment. */
export const WAIT_FOR_TOTP_SECRET_TIMEOUT_MS = 120_000;

// ── Extension identity ─────────────────────────────────────────────────────────

/** Display name used as the TOTP factor alias, banner label, and WebAuthn RP name. */
export const EXTENSION_NAME = "CUNYAutoLogin" as const;
