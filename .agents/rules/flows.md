<!-- Load when: working on vault controller, content script, service worker, onboarding flow, or TOTP/autofill behavior -->

# Session unlock and auto-fill flows

## Session unlock (`sidebar/vaultController.ts`)

Three modes: `setup`, `locked`, `unlocked`. On every side panel open, `init()` calls `loadVaultSessionSnapshot()` (`src/vaultSession/snapshot.ts`), which reads `storage.local` + `storage.session`, attempts PBKDF2 + AES-GCM decrypt, and returns the mode. If decryption fails the session master is purged and sidebar falls back to `locked`.

`sidebar/sidebar.ts` loads `onboarding/render.ts` when:
- A `#qa=<STATE>` dev-jump hash is present (dev/e2e only) — this branch also clears the resume snapshot (`clearResumeSnapshotSession`) and mounts with `{ qaJump }`
- URL hash has `#onboarding=1` (dev/e2e only)
- No vault exists yet
- A session resume snapshot exists

The master password writes to `storage.session` after every successful unlock or save. It clears immediately on **Lock vault**.

`storage.session` writes/reads are wrapped in try/catch and degrade to always-locked on unsupported browsers (below the manifest floors in `src/manifest.json`: Firefox < **140**, Chromium below `minimum_chrome_version`, currently **141**).

## Auto-fill flow

1. **Content script** (`content.ts`): On each `ssologin.cuny.edu` tab load, `autoFill()` sends `{ type: "AUTO_FILL_REQUEST" }` to the service worker.
2. **Service worker** (`service-worker.ts`): Reads session master + encrypted vault, decrypts, returns `{ success: true, payload }` or a failure reason (`no_session_master`, `no_vault`, `decrypt_error`, `storage_error`). **Onboarding fallback:** when no vault exists and the sidebar staged credentials via `STAGE_ONBOARDING_CREDENTIALS`, the SW returns those for first-login steps. It can also merge a pending TOTP secret override (`PENDING_TOTP_SECRET_SESSION_KEY`) into that fallback payload.
3. **Content script** (`main()`): Chooses behavior by URL using helpers from `src/cuny/ssoSite.ts` (`matchesCredentialPage`, `matchesTotpPage`). `fillCredentials` / `fillTotp` wait for Oracle JET–rendered controls, set values in a Knockout-aware way, then click submit / Verify.

Oracle JET renders inputs after `document_idle` — content script uses `MutationObserver` + timeouts.

4. **Manual test** (`debugPanel.ts`, dev builds only): **Send test FILL_CREDENTIALS** sends `sessionPayload` to the active tab. The `FILL_CREDENTIALS` listener in `content.ts` is gated by `if (import.meta.env.DEV)` — tree-shaken from production bundle by Vite.

## TOTP enroll secret scraping

1. **Content script** (`watchTotpSecretOnEnrollPage`): On pages matching `matchesTotpEnrollPage`, waits via `MutationObserver` for `TOTP_SECRET_DISPLAY_ARIA_LABELLEDBY`. Normalizes (strip whitespace, uppercase, strip trailing `=`; reject if invalid Base32) and sends `{ type: "TOTP_SECRET_FROM_PAGE", secret }`.
2. **Service worker**: Validates and writes to `storage.session` under `PENDING_TOTP_SECRET_SESSION_KEY`.
3. **Side panel** (`guidedSecretCapture.ts`): Polls `storage.session` at `RUI_ONBOARDING_POLL_INTERVAL_MS` (no `onChanged` listener) — shows a capture confirmation when the key appears. On the `factors_list_after_enroll` stage, `render.ts` (`handleFactorsListAfterEnroll`) reads the key directly. If absent, it shows a recovery message prompting re-enroll. If present, the next step depends on the current state: from `VERIFY_LOGIN_CODE` it dispatches `VERIFY_SUCCEEDED`; from `CUNY_TOTP` / `ALLOW_GATE` / `OAA_SPA_HOME` / the `GUIDED_*` states it fast-forwards to `SET_DEFAULT`.

## MFA self-service verify OTP flow

After TOTP factor enrollment, the IdP requires a one-time verification code. Page: `…/oaa/rui/index.html?h_ra=1`.

1. **Content script** (`startMfaEnrollVerifyOtpPolling`): On pages matching `matchesRuiMfaEnrollVerifyPage`, starts a `setInterval` at `RUI_MFA_ENROLL_VERIFY_POLL_INTERVAL_MS`. On each tick, looks for `RUI_MFA_ENROLL_VERIFY_OTP_INPUT_ID`.
2. When the field appears, sends `AUTO_FILL_REQUEST`, generates TOTP from vault secret, fills the field. The interval keeps running after a successful fill to watch for a server-side "Incorrect code" (one auto-retry on the first failure); it clears only on a client-side empty-OTP error or on the second server-side failure.

Polling instead of `MutationObserver` because the Oracle SPA re-renders in ways that made observers flaky.

## Advanced key flow (PASSWORD_ENTRY fork)

After `PASSWORD_ENTRY`, `NEXT` routes to `CHOOSE_SETUP_PATH` instead of directly to `OPENING_CUNY`. The fork screen offers three cards:

- **Guided (new setup)** → `CHOOSE_GUIDED` → `OPENING_CUNY` (original path)
- **Reuse key from another device** → `CHOOSE_REUSE_KEY` → `KEY_FROM_OTHER_DEVICE`
- **Import from a 2FA app** → `CHOOSE_IMPORT_KEY` → `KEY_FROM_AUTH_APP`

Both `KEY_FROM_*` screens use the shared `pasteKeyScreen.ts` component. On **Confirm**:
1. The normalised TOTP secret is written to `storage.session` under `PENDING_TOTP_SECRET_SESSION_KEY`.
2. `KEY_CONFIRMED` is dispatched → `TEST_LOGIN`.

`render.ts` tracks which paste screen was entered via `keyEntryOriginRef` (set on each state transition through `subscribeOnboardingController`). When the user hits **Back** on `TEST_LOGIN_BAD_KEY`, `RETRY_KEY` is dispatched and render.ts redirects to the recorded origin screen (`KEY_FROM_OTHER_DEVICE` or `KEY_FROM_AUTH_APP`) rather than dispatching via the transition table.

### TEST_LOGIN on-mount behaviour

`testLogin.ts` fires two runtime messages plus a `tabs.create` call immediately on mount (best-effort, errors are dev-only logged):
1. `LOGOUT_CUNY_SESSIONS` — runtime message; terminates any existing OAA session.
2. `STAGE_ONBOARDING_CREDENTIALS` — runtime message; stages email + password so the content script can fill them.
3. `browser.tabs.create` — a tabs API call (not a `sendMessage`); opens `BRIGHTSPACE_HOME_URL` (overridable via `#cuny=<url>` in dev mode). Brightspace redirects through SAML (`/oamfed/idp/samlv20`) for credential/TOTP autofill, then lands on Brightspace home — no allow gate.

`TEST_LOGIN` is listed in `CUNY_REATTACHABLE_STATES`, so the tab-reattach resume mechanism works the same way as `OPENING_CUNY`.

The service worker supplies the pasted TOTP secret for the login challenge: when `AUTO_FILL_REQUEST` arrives with `otpContext === "login_totp"` (or undefined) while staged credentials are present and no `enrollSecretOverride` is set, `resolveAutoFillResponse` reads `PENDING_TOTP_SECRET_SESSION_KEY` from session storage and injects it as `totpSecretOverride`.

### TEST_LOGIN result signals

| Signal | Source | Sidebar action |
|---|---|---|
| `d2lSessionVal` or `d2lSecureSessionVal` cookie set on `brightspace.cuny.edu` | `wireBrightspaceCookieDetection` in render.ts (`cookies.onChanged`) | `TEST_SUCCEEDED` → `EXT_PASSWORD_SETUP` (skips guided MFA screens) |
| `ONBOARDING_CREDENTIAL_ERROR` while in `TEST_LOGIN` | content script | `TEST_BAD_CREDENTIALS` → `TEST_LOGIN_BAD_CREDENTIALS` screen |
| `ONBOARDING_VERIFY_STATUS { status: "second_failure" }` while in `TEST_LOGIN` | content script TOTP error page | `TEST_BAD_KEY` → `TEST_LOGIN_BAD_KEY` screen |

## Onboarding message bridge

`onboarding/render.ts` registers `runtime.onMessage` routing known `ONBOARDING_*` messages through `applyOnboardingMessage(controller, message)`:

- `ONBOARDING_CREDENTIAL_ERROR { culprit }` → if state is `TEST_LOGIN`, dispatches `TEST_BAD_CREDENTIALS`; otherwise routes to `EMAIL_ENTRY` or `PASSWORD_ENTRY` with an inline red banner.
- `ONBOARDING_STAGE_DETECTED { stage }` → dispatched through a frozen handler map keyed by stage (`render.ts`). The handlers are catch-up routers: each fast-forwards the state machine to match the live CUNY page detected by the content script. The full map:

  | Stage | Handler / effect |
  |---|---|
  | `credential_page` | no-op |
  | `cuny_totp_challenge` | advances `CUNY_TOTP` |
  | `allow_gate` | advances `OPENING_CUNY` (`CREDENTIALS_ACCEPTED`) or `CUNY_TOTP` (`TOTP_DONE`) toward `ALLOW_GATE` — **not** `TEST_LOGIN` (see below) |
  | `allow_button_clicked` | `handleAllowButtonClicked` |
  | `oaa_spa_home` | `handleOaaSpaHome` |
  | `factors_list` | from `CUNY_TOTP` / `ALLOW_GATE` / `OAA_SPA_HOME`, fast-forwards via a `FACTORS_LIST_READY` sequence to the guided manage step |
  | `add_factor` | `handleAddFactor` |
  | `factor_type_select` | `GUIDED_ADD_FACTOR` → `GUIDED_STEP_DONE` |
  | `totp_enroll_secret` | fast-forwards the guided enroll steps toward secret capture |
  | `totp_enroll_verify` | from `GUIDED_SECRET_CAPTURE` dispatches `SECRET_CAPTURED`; from `CUNY_TOTP` / `ALLOW_GATE` / `OAA_SPA_HOME` fast-forwards to `VERIFY_LOGIN_CODE` |
  | `factors_list_after_enroll` | reads the pending TOTP secret and routes to `SET_DEFAULT` / `VERIFY_SUCCEEDED` (see "TOTP enroll secret scraping" above) |
  | `set_default_menu_opened` | `handleSetDefaultMenuOpened` |
  | `set_default_confirmed` | `handleSetDefaultConfirmed` |
  | `unverified_cunyautologin`, `totp_factor_limit`, `access_denied`, `target_not_found` | no-op |

  The `allow_gate` handler is **not** wired to `TEST_LOGIN`: the allow gate is a mid-flow consent page, not login proof, so TEST_LOGIN success comes only from the real Brightspace session cookie (`wireBrightspaceCookieDetection` → `TEST_SUCCEEDED`).
- `ONBOARDING_REOPEN_CUNY_TAB` → service worker opens an allow-listed URL in a new tab (default `CUNY_LOGIN_ENTRY_URL` when `url` omitted; `COMPLETE_DEMO` sends `BRIGHTSPACE_HOME_URL`).
- `ONBOARDING_VERIFY_STATUS { status }` → `"success"` advances `VERIFY_LOGIN_CODE` to `VERIFY_SUCCEEDED`; `"second_failure"` advances `TEST_LOGIN` to `TEST_BAD_KEY` (or shows pause banner on `VERIFY_LOGIN_CODE`).
- `ONBOARDING_OVERLAY_COMMAND` / `ONBOARDING_TAB_REATTACHED` → validated and ack-only via service worker; sidebar handlers wired in `onboarding/render.ts`.

On sidebar unmount, `mountOnboarding` fires `CLEAR_ONBOARDING_CREDENTIALS`.

Session resume snapshot (`cunyOnboardingResumeSnapshot` in `storage.session`) stores `{ state, email, password, advancedKeyFlow }` for resumable states only. Never persisted to `storage.local`.

## Extension banner on CUNY tab

`src/content/banner.ts` mounts a branded credential-error banner (`mountCredentialErrorBanner`). Inline styles + INT_MAX z-index; attached to `document.documentElement` to survive late JET mutations. Mount/unmount are idempotent.

## SSO site constants

All URL path markers, DOM element IDs, timing constants, and host-level patterns used at runtime (including `browser.tabs.query` URL filters) live in `src/cuny/ssoSite.ts`. Do not duplicate SSO hosts, paths, or CUNY DOM ids in `content.ts`, `service-worker.ts`, or other modules — import from `ssoSite.ts` instead.

For live page structure — selectors, timing, DOM skeletons — consult `.map/`. Start with `.map/README.md`, then the relevant `pages/*.md` and `conventions.md`.
