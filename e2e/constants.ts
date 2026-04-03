/** Keep in sync with `host_permissions` / `matches` in `src/manifest.e2e.json`. */
export const FIXTURE_PORT = 4173;

export const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}` as const;

export const CREDENTIAL_FIXTURE_URL = `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi`;

export const TOTP_FIXTURE_URL = `${FIXTURE_ORIGIN}/oaa-totp-factor/`;
