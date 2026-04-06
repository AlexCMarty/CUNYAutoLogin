/** Keep in sync with `host_permissions` / `matches` in `src/manifest.e2e.json`. */
export const FIXTURE_PORT = 4173;

export const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}` as const;

export const CREDENTIAL_FIXTURE_URL = `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi`;
export const CREDENTIAL_SAMLV20_FIXTURE_URL = `${FIXTURE_ORIGIN}/oamfed/idp/samlv20`;

export const TOTP_FIXTURE_URL = `${FIXTURE_ORIGIN}/oaa-totp-factor/`;

export const SELF_SERVICE_FIXTURE_URL = `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1`;
export const SELF_SERVICE_INVALID_SECRET_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/oaa/rui/index.html?h_ra=1&secret=not-a-valid-secret!`;