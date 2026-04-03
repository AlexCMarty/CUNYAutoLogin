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

export const matchesCredentialPage = (url: string): boolean =>
  CREDENTIAL_PAGE_PATH_MARKERS.some((marker) => url.includes(marker));

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
 * MFA Self-Service “verify new TOTP factor” step: same host/path as other RUI screens, but this
 * exact query identifies the post-enrollment verification UI. Compare with `location.href` only.
 */
export const RUI_MFA_ENROLL_VERIFY_PAGE_URL =
  `${SSO_LOGIN_ORIGIN}/oaa/rui/index.html?h_ra=1` as const;

export const matchesRuiMfaEnrollVerifyPage = (url: string): boolean =>
  url === RUI_MFA_ENROLL_VERIFY_PAGE_URL;

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

/** Session-only staging for a secret scraped from the enroll page (popup consumes + clears). */
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
