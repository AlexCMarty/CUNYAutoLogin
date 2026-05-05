<!-- Load when: working on vault controller, content script, service worker, onboarding flow, or TOTP/autofill behavior -->

# Session unlock and auto-fill flows

## Session unlock (`sidebar/vaultController.ts`)

Three modes: `setup`, `locked`, `unlocked`. On every side panel open, `init()` calls `loadVaultSessionSnapshot()` (`src/vaultSession/snapshot.ts`), which reads `storage.local` + `storage.session`, attempts PBKDF2 + AES-GCM decrypt, and returns the mode. If decryption fails the session master is purged and sidebar falls back to `locked`.

`sidebar/sidebar.ts` loads `onboarding/render.ts` when:
- No vault exists yet
- A session resume snapshot exists
- URL hash has `#onboarding=1` (dev/e2e only)

Hash `#vault=1` (dev/e2e only) forces the vault setup form on an empty profile.

The master password writes to `storage.session` after every successful unlock or save. It clears immediately on **Lock vault**.

`storage.session` writes/reads are wrapped in try/catch and degrade to always-locked on unsupported browsers (Firefox < 115, Chromium below `minimum_chrome_version` in `src/manifest.json`, currently **114**).

## Auto-fill flow

1. **Content script** (`content.ts`): On each `ssologin.cuny.edu` tab load, `autoFill()` sends `{ type: "AUTO_FILL_REQUEST" }` to the service worker.
2. **Service worker** (`service-worker.ts`): Reads session master + encrypted vault, decrypts, returns `{ success: true, payload }` or a failure reason (`no_session_master`, `no_vault`, `decrypt_error`). **Onboarding fallback:** when no vault exists and the sidebar staged credentials via `STAGE_ONBOARDING_CREDENTIALS`, the SW returns those for first-login steps. It can also merge a pending TOTP secret override (`PENDING_TOTP_SECRET_SESSION_KEY`) into that fallback payload.
3. **Content script** (`main()`): Chooses behavior by URL using helpers from `src/cuny/ssoSite.ts` (`matchesCredentialPage`, `matchesTotpPage`). `fillCredentials` / `fillTotp` wait for Oracle JET–rendered controls, set values in a Knockout-aware way, then click submit / Verify.

Oracle JET renders inputs after `document_idle` — content script uses `MutationObserver` + timeouts.

4. **Manual test** (`debugPanel.ts`, dev builds only): **Send test FILL_CREDENTIALS** sends `sessionPayload` to the active tab. The `FILL_CREDENTIALS` listener in `content.ts` is gated by `if (import.meta.env.DEV)` — tree-shaken from production bundle by Vite.

## TOTP enroll secret scraping

1. **Content script** (`watchTotpSecretOnEnrollPage`): On pages matching `matchesTotpEnrollPage`, waits via `MutationObserver` for `TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY`. Normalizes (strip whitespace, uppercase, strip trailing `=`; reject if invalid Base32) and sends `{ type: "TOTP_SECRET_FROM_PAGE", secret }`.
2. **Service worker**: Validates and writes to `storage.session` under `PENDING_TOTP_SECRET_SESSION_KEY`.
3. **Side panel** (`storage.session.onChanged`): Detects the key, reads it, pre-fills the TOTP input, clears the session key.

## MFA self-service verify OTP flow

After TOTP factor enrollment, the IdP requires a one-time verification code. Page: `…/oaa/rui/index.html?h_ra=1`.

1. **Content script** (`startMfaEnrollVerifyOtpPolling`): On pages matching `matchesRuiMfaEnrollVerifyPage`, starts a `setInterval` at `RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS`. On each tick, looks for `RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID`.
2. When the field appears, sends `AUTO_FILL_REQUEST`, generates TOTP from vault secret, fills the field. Interval clears after successful fill.

Polling instead of `MutationObserver` because the Oracle SPA re-renders in ways that made observers flaky.

## Onboarding message bridge

`onboarding/render.ts` registers `runtime.onMessage` routing known `ONBOARDING_*` messages through `applyOnboardingMessage(controller, message)`:

- `ONBOARDING_CREDENTIAL_ERROR { culprit }` → routes sidebar to `EMAIL_ENTRY` (culprit === "email") or `PASSWORD_ENTRY` (default) with an inline red banner. Content script emits this when the credential-error DOM marker is present.
- `ONBOARDING_STAGE_DETECTED { stage: "allow_gate" }` → advances `OPENING_CUNY` to `ALLOW_GATE`.
- `ONBOARDING_REOPEN_CUNY_TAB` → service worker opens `CUNY_LOGIN_ENTRY_URL` in a new tab.
- `ONBOARDING_OVERLAY_COMMAND` / `ONBOARDING_VERIFY_STATUS` / `ONBOARDING_TAB_REATTACHED` → validated and ack-only via service worker; sidebar handlers wired in `onboarding/render.ts`.

On sidebar unmount, `mountOnboarding` fires `CLEAR_ONBOARDING_CREDENTIALS`.

Session resume snapshot (`cunyOnboardingResumeSnapshot` in `storage.session`) stores `{ state, email, password }` for resumable states only. Never persisted to `storage.local`.

## Extension banner on CUNY tab

`src/content/banner.ts` mounts a branded credential-error banner (`mountCredentialErrorBanner`). Inline styles + INT_MAX z-index; attached to `document.documentElement` to survive late JET mutations. Mount/unmount are idempotent.

## SSO site constants

All URL path markers, DOM element IDs, timing constants, and host-level patterns used at runtime (including `browser.tabs.query` URL filters) live in `src/cuny/ssoSite.ts`. Do not duplicate SSO hosts, paths, or CUNY DOM ids in `content.ts`, `service-worker.ts`, or other modules — import from `ssoSite.ts` instead.

For live page structure — selectors, timing, DOM skeletons — consult `.map/`. Start with `.map/README.md`, then the relevant `pages/*.md` and `conventions.md`.
