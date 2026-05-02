/** Keep in sync with `host_permissions` / `matches` in `src/manifest.e2e.json`. */
export const FIXTURE_PORT = 4173;

export const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}` as const;

export const CREDENTIAL_FIXTURE_URL = `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi`;
export const CREDENTIAL_SAMLV20_FIXTURE_URL = `${FIXTURE_ORIGIN}/oamfed/idp/samlv20`;

/** Credential fixture: submit advances to `/oaa-totp-factor/`. */
export const CREDENTIAL_FIXTURE_ADVANCE_URL =
  `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi?advance=1`;

/** Credential fixture: submit re-renders with `#serverError` (inline wrong password). */
export const CREDENTIAL_FIXTURE_WRONG_INLINE_URL =
  `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi?wrong=1`;

/** Credential fixture: submit redirects to `/auth_cred_submit` (wrong password path). */
export const CREDENTIAL_FIXTURE_WRONG_REDIRECT_URL =
  `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi?wrong=redirect`;

/** Direct fixture URL for Oracle `/auth_cred_submit` rejection page. */
export const CREDENTIAL_ERROR_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oam/server/auth_cred_submit`;

export const TOTP_FIXTURE_URL = `${FIXTURE_ORIGIN}/oaa-totp-factor/`;

export const SELF_SERVICE_FIXTURE_URL = `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1`;
export const SELF_SERVICE_INVALID_SECRET_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&secret=not-a-valid-secret!`;

/** Simulates /cunylogin/pages/mfaConsent.jsp (the OAuth Allow/Deny consent page). */
export const ALLOW_GATE_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/cunylogin/pages/mfaConsent.jsp`;

/**
 * Allow-gate fixture that redirects to the oaa-spa-home view on Allow click.
 * Use when testing the full Allow → oaa-spa-home → factors-list transition chain.
 */
export const ALLOW_GATE_NEXT_OAA_HOME_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/cunylogin/pages/mfaConsent.jsp?next=${encodeURIComponent(
    `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&view=home`
  )}`;

/** Simulates the oaa-spa-home SPA view (id="categoryActionheader", Manage button). */
export const OAA_SPA_HOME_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&view=home`;

/** Simulates the factors-list SPA view with one enrolled factor + Add menu. */
export const FACTORS_LIST_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&view=factors`;

/**
 * Factors-list with 5 enrolled factors and ChallengeOMATOTP oj-disabled.
 * Used to test the five-factor limit edge case.
 */
export const FACTORS_LIST_FULL_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&view=factors&full=1`;

/** Simulates the totp-enroll-secret SPA view (secret display, name input, Verify Now). */
export const TOTP_ENROLL_SECRET_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&view=secret`;

/** Simulates the totp-enroll-verify SPA view (otp|input, Verify and Save). */
export const TOTP_ENROLL_VERIFY_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&view=verify`;

/** Enrollment verify with server-side "Incorrect code" error response. */
export const TOTP_ENROLL_VERIFY_WRONG_CODE_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&view=verify&wrongCode=1`;

/** Post-enrollment factors-list with CUNYAutoLogin enrolled and not yet default. */
export const FACTORS_POST_ENROLL_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&view=post-enroll`;

/** Post-enrollment factors-list with CUNYAutoLogin enrolled but Unverified. */
export const FACTORS_POST_ENROLL_UNVERIFIED_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&view=post-enroll-unverified`;