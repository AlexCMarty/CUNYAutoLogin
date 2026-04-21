/** Keep in sync with `host_permissions` / `matches` in `src/manifest.e2e.json`. */
export const FIXTURE_PORT = 4173;

export const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}` as const;

export const CREDENTIAL_FIXTURE_URL = `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi`;
export const CREDENTIAL_SAMLV20_FIXTURE_URL = `${FIXTURE_ORIGIN}/oamfed/idp/samlv20`;

/** Plan-05: credential page that advances to /oaa-totp-factor/ on submit. */
export const CREDENTIAL_FIXTURE_ADVANCE_URL =
  `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi?advance=1`;

/** Plan-05: credential page that re-renders with `#serverError` on submit. */
export const CREDENTIAL_FIXTURE_WRONG_INLINE_URL =
  `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi?wrong=1`;

/** Plan-05: credential page that redirects to /auth_cred_submit on submit. */
export const CREDENTIAL_FIXTURE_WRONG_REDIRECT_URL =
  `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi?wrong=redirect`;

/** Plan-05: direct access to the Oracle rejection endpoint fixture. */
export const CREDENTIAL_ERROR_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oam/server/auth_cred_submit`;

export const TOTP_FIXTURE_URL = `${FIXTURE_ORIGIN}/oaa-totp-factor/`;

export const SELF_SERVICE_FIXTURE_URL = `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1`;
export const SELF_SERVICE_INVALID_SECRET_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&secret=not-a-valid-secret!`;