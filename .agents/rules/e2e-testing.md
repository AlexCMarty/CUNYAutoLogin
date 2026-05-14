<!-- Load when: writing or running E2E tests in e2e/ -->

# E2E testing conventions

## Before running tests

`npm run test:e2e` runs `npm run build:e2e` first. Run `build:e2e` manually only when invoking `playwright test` directly.

`build:e2e` is a dev build with `manifest.e2e.json` — adds `http://127.0.0.1:4173/*` to `host_permissions` and `content_scripts.matches` for the local fixture server.

## Fixture server (`e2e/fixtures-server.mjs`)

Local HTTP server on `FIXTURE_PORT` serving `e2e/fixtures/`. Current routes:
- `credential.html` — `/oam/server/obrareq.cgi` (supports `?advance=1`, `?wrong=1`, `?wrong=redirect`)
- `credential-error.html` — `/oam/server/auth_cred_submit`
- `credential-success-transient.html` — `/oam/server/auth_cred_submit?outcome=success`
- `totp.html` — `/oaa-totp-factor/` (supports `?next=<url>`)
- `self-service.html` — `/oaa/rui/index.html` (supports `?view=home|factors|secret|verify|post-enroll|post-enroll-unverified`)
  - `?view=home` auto-clicks Manage after 1500ms
  - `?view=secret` Verify Now appends `&autoSubmit=1`; `?view=verify&autoSubmit=1` suppresses empty-OTP error
- `allow-gate.html` — `/cunylogin/pages/mfaConsent.jsp` (supports `?next=<url>`)
- `credential.html` (also) — `/oamfed/idp/samlv20` — SAMLv20 redirect variant used by `unlocked.spec.ts` (exported as `CREDENTIAL_SAMLV20_FIXTURE_URL` from `e2e/constants.ts`)

**Firefox is not supported** in E2E — test manually via `about:debugging`.

## Extension loader (`e2e/extension-fixture.ts`)

Extends Playwright `test` with a `context` fixture that launches Chromium via `chromium.launchPersistentContext` with `--load-extension=dist/`. Provides `extensionId` fixture.

## Sidebar screenshot CLI (`scripts/capture-sidebar.mjs`)

For agents or humans who need one or more PNGs of `sidebar.html` without a full Playwright suite: `npm run build:e2e` then one of:

```bash
npm run capture-sidebar -- '#qa=WELCOME'        # any jumpable onboarding state
npm run capture-sidebar -- '#qa=EMAIL_ENTRY&qaCred=email'     # credential error on email field
npm run capture-sidebar -- '#qa=PASSWORD_ENTRY&qaCred=password' # credential error on password field
npm run capture-sidebar -- --qa-vault-locked    # vault locked UI
npm run capture-sidebar -- --qa-vault-unlocked  # vault unlocked / management UI (generates real crypto vault)
npm run capture-sidebar -- --capture-all        # all 22 visual states, one PNG each; prints one path per line
```

All 18 jumpable onboarding states are valid hash targets in **non-production** bundles (`build:e2e` / `build:dev`). `CREDENTIAL_ERROR` has no screen mount — use the `qaCred` variants above instead.

Viewport defaults to **380×800**; use `--width` / `--height` to override. Writes under `agent_screenshots/` by default; stdout is one absolute path per PNG. Full state table: `CONTRIBUTING.md` → **Sidebar screenshots (CLI)**.

## Test isolation and concurrency

`playwright.config.ts`: `workers: 6`, `fullyParallel: true`. Each worker gets its own browser context + fresh extension instance. Storage is isolated per context.

Many flows use `clearVaultIfPossible` (debug panel `#clear-vault-debug-btn`) — only rendered in dev builds.

Prefer shared helpers from `e2e/helpers.ts`:
- `setupVault(page, extensionId)` — programmatically seeds vault + session master via `window.crypto.subtle`, then reloads sidebar to unlocked state
- `clearVaultIfPossible(page)` — clicks dev-panel `#clear-vault-debug-btn` if present; post-clear asserts WELCOME screen
- `lockVault(page)` — clicks lock button, asserts locked header
- `walkToPasswordEntry` — Welcome → Email → Password
- `onboardingHashWith(cunyUrl)` — builds `#onboarding=1&cuny=<encoded>` hash

## WebAuthn / biometric tests

Biometric flows (`BIOMETRIC_OFFER`, `BIOMETRIC_PREP`, vault biometric unlock) require a CDP virtual platform authenticator on the sidebar tab. Use `addVirtualPlatformAuthenticator(page)` from `e2e/webauthnVirtualAuthenticator.ts` and call `.remove()` in `afterEach` — without it `isUserVerifyingPlatformAuthenticatorAvailable()` returns false and the offer screen auto-dispatches `BIOMETRIC_DECLINED`. Toggle `hasPrf: false` or call `setUserVerified(false)` to drive the prep-screen fallback paths.

## Adding fixture pages

Add HTML to `e2e/fixtures/` and export the URL as a named constant in `e2e/constants.ts`. Never construct fixture URLs inline in specs.

```typescript
// e2e/constants.ts
export const CREDENTIAL_FIXTURE_URL = `${FIXTURE_ORIGIN}/oam/server/obrareq.cgi`;

// spec
await fixturePage.goto(CREDENTIAL_FIXTURE_URL);
```

## DOM element IDs

Import element IDs from `src/cuny/ssoSite.ts` in specs — same constants the extension uses. Guarantees specs break immediately on rename rather than silently testing the wrong element.

```typescript
import { CREDENTIAL_INPUT_IDS, TOTP_OTP_INPUT_ID } from "../src/cuny/ssoSite";
```

## Test naming and assertions

Plain sentences, no "should". Assert observable behavior — filled inputs, page state, submitted forms. Do not inspect internal module state.

```typescript
// Good
test("fills credential page via AUTO_FILL_REQUEST on load", async () => { ... });

// Bad — reaches into implementation internals
expect((content as any)._lastFilledEmail).toBe(E2E_EMAIL);

// Good — observes the DOM
await expect(fixturePage.locator(`#${CREDENTIAL_INPUT_IDS.username}`)).toHaveValue(E2E_EMAIL);
```
