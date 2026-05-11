<!-- Load when: touching biometric unlock, WebAuthn, PRF, src/crypto/biometric.ts, or any onboarding/sidebar screen that prompts for fingerprint / Touch ID / Windows Hello -->

# Biometric vault unlock (WebAuthn PRF)

## Overview

The extension can wrap the vault master password with a key derived from the WebAuthn PRF (HMAC-secret) extension, so a fingerprint / Touch ID / Windows Hello prompt can unlock the vault instead of typing the master password. The 32-byte PRF secret is computed by the authenticator and returned directly to the extension page — **no server is involved**. The secret never leaves the device.

- **Implementation:** `src/crypto/biometric.ts`
- **Storage key:** `cunyBiometricCredential` in `browser.storage.local` (AES-GCM-wrapped master password + credential metadata; no plaintext secrets — see `.agents/rules/security.md`).
- **rp.id:** `WEBAUTHN_RP_ID` from `src/cuny/ssoSite.ts` (`"ssologin.cuny.edu"`).
- **Current status:** dev build only. Gated by `if (import.meta.env.MODE !== "production")` at the call sites. Production bundles must not ship the biometric onboarding screens until the platform support story stabilises.

## Minimum platform requirements

PRF / HMAC-secret support is the tight constraint — extension-page WebAuthn is the looser one. Both must hold.

| Platform | Works? | Notes |
|---|---|---|
| Chrome 122+ on macOS Touch ID | yes | one-prompt enroll |
| Chrome 122+ on Windows Hello, build **26200.7840+** with **KB5077181** (Feb 2026) | yes | `WEBAUTHN_API_VERSION_8` exposes hmac-secret |
| Chrome 122+ on Windows Hello, older builds | **no** | `prf.enabled === false` — bail to fallback |
| Chrome Profile / Google Password Manager passkey on Windows | **no** | GPM desktop does not surface PRF, regardless of Windows version |
| Firefox 150+ (any platform authenticator that supports hmac-secret) | yes | Bug 1956484 enabled extension-page WebAuthn |
| Firefox 128–149 | **no** | `credentials.create/get` from `moz-extension://` throws `SecurityError` → `"unsupported_browser"` |
| Any FIDO2 hardware key with hmac-secret (YubiKey 5, etc.) | yes | cross-platform authenticator path |
| Windows 11 22H2 (without KB5077181) | **no** | common misconception — 22H2 did not add hmac-secret |
| Chrome < 122 or Firefox < 150 | **no** | extension-page WebAuthn not allowed |

Minimum browsers for this extension (`src/manifest.json`) are Firefox 128+ and Chromium 141+, so the Firefox 128–149 case must degrade gracefully — it cannot be raised as a hard minimum.

## WebAuthn from extension pages

Chrome 122+ and Firefox 150+ allow `navigator.credentials.create/get` from extension pages provided **`rp.id` matches a domain in `host_permissions`**. This extension declares `https://ssologin.cuny.edu/*` and `https://brightspace.cuny.edu/*`, so `rp.id: "ssologin.cuny.edu"` is the correct value (centralised as `WEBAUTHN_RP_ID` in `src/cuny/ssoSite.ts`).

What the browser puts in `clientDataJSON.origin`:
- Chrome: `chrome-extension://<id>`
- Firefox: `moz-extension://<sha256-hash>`

That origin would only matter to a relying party doing server-side verification — there is no server here, so it does not.

## Enrollment flow (`enrollBiometric`)

One `credentials.create()` call with PRF requested up front. The decision tree after create() determines whether enrollment is one prompt or two.

```
create({ extensions: { prf: { eval: { first: salt } } } })
        │
        ├─ Throws SecurityError / NotSupportedError / InvalidStateError
        │     → "unsupported_browser" (fallback)
        │
        ├─ Throws NotAllowedError / AbortError
        │     → "user_cancelled" (retry, NOT fallback)
        │
        └─ Returns credential
              │
              ├─ getClientExtensionResults().prf.enabled === false
              │     → throw PrfUnavailableError → "prf_unavailable" (fallback)
              │     CRITICAL: do NOT call get() — Windows shows "Something
              │     went wrong" because the credential was enrolled without
              │     HMAC-secret.
              │
              ├─ prf.enabled === true AND prf.results.first present
              │     → use PRF from create() (ONE prompt total)
              │
              └─ prf.enabled === true AND prf.results absent
                    → second credentials.get() with PRF (TWO prompts total)
```

Then:

1. Capture `transports` from `attestationResponse.getTransports()` and store them. Needed for every future `get()` (see pitfalls).
2. AES-GCM-wrap the master password with a key imported from the PRF output (`importKey("raw", prfOutput, "AES-GCM", ...)`).
3. Persist `{ version: 1, credentialIdB64, transports, prfSaltB64, ivB64, wrappedMasterB64 }` to `storage.local["cunyBiometricCredential"]`.

## Unlock flow (`unlockWithBiometric`)

Single `credentials.get()` prompt:

1. Read stored credential from `storage.local`.
2. `get()` with `rpId`, `allowCredentials: [{ id, type, transports }]`, `userVerification: "required"`, `extensions: { prf: { eval: { first: prfSalt } } }`.
3. Read `getClientExtensionResults().prf.results.first` — if absent, `"prf_unavailable"`.
4. Import as AES-GCM key, decrypt `wrappedMaster`, return the master password string.
5. Caller passes it to existing `decryptVault()` — biometric unlock is just a different way of obtaining the same master password the user would otherwise type.

`isBiometricEnrolled()` / `clearBiometricCredential()` are storage-only helpers (no WebAuthn calls).

## Error → action mapping

`BiometricError` is the discriminated union returned via `neverthrow`. The mapping lives in `mapWebAuthnError` (`src/crypto/biometric.ts`).

| Cause | `BiometricError` | UX action |
|---|---|---|
| `DOMException` name `SecurityError` / `NotSupportedError` / `InvalidStateError` | `"unsupported_browser"` | enter fallback — "Your browser or device doesn't support biometric unlock. You'll use your extension password instead." + Continue anyway |
| `DOMException` name `NotAllowedError` / `AbortError` | `"user_cancelled"` | **retry** — "Didn't catch that — tap Continue to try again". Do **not** enter fallback. |
| `prf.enabled === false` after create() | `"prf_unavailable"` | enter fallback |
| `prf.results.first` absent after get() with `enabled === true` | `"prf_unavailable"` | enter fallback |
| Storage read/write failure | `"storage_error"` | surface generic error |
| AES-GCM import/encrypt/decrypt failure, unexpected types | `"crypto_error"` | enter fallback |
| `unlockWithBiometric` called with no stored credential | `"not_enrolled"` | route caller to enroll flow |

## What breaks and why

- **"Insert your security key" dialog on Windows instead of Windows Hello.** Cause: `allowCredentials` entry omitted `transports`. Chrome falls through to the native FIDO2 stack. Fix: always pass `transports` captured during create() (stored as `transports` on the credential blob).
- **"Sign in with a passkey" dialog showing `chrome-extension://...` as the relying party.** Cause: `rpId` was omitted from `get()`. Chrome defaulted to the extension origin. Fix: always pass `rpId: WEBAUTHN_RP_ID`.
- **Windows "Something went wrong - There was a problem signing in with your passkey".** Cause: get() was called with PRF on a credential that was enrolled with `prf.enabled === false` (Windows Hello pre-KB5077181, Chrome GPM). Fix: branch on `prf.enabled` from the create() result and bail to `"prf_unavailable"` before calling get().
- **`SecurityError` immediately on `create()` from Firefox 128–149.** Cause: extension-page WebAuthn shipped in Firefox 150 (Bug 1956484). Fix: already mapped to `"unsupported_browser"`; the prep screen degrades to the password fallback.
- **No OS prompt at all.** Cause (historical, fixed): the prep screen tried to dry-run WebAuthn without `rp.id`. Always pass `rp: { id: WEBAUTHN_RP_ID }` from create() and `rpId: WEBAUTHN_RP_ID` from get().

## The `import.meta.env.DEV` trap

`import.meta.env.DEV` is **always `false` in `vite build` output, even with `--mode development`**. Using it to gate features (or to keep debug logging) silently strips them from the dev build. **Use `import.meta.env.MODE !== "production"` instead.** This is the established pattern in this codebase — see the commit history around the biometric feature for the bug this caused. Note that content-script code uses `if (import.meta.env.DEV)` for tree-shaking the FILL_CREDENTIALS test path (see `.agents/rules/flows.md`); that is the **only** correct use because the content-script Vite config does behave like a dev server in dev builds. Everywhere else in the extension, prefer `MODE !== "production"`.

## When to search the web

PRF / HMAC-secret support tables move every few months as browsers and OS updates ship. Training data is stale. Search before trusting any version claim:

- Verifying OS / browser minimum versions for a specific platform (especially Windows Hello cumulative-update numbers).
- Debugging "Something went wrong" or any unfamiliar WebAuthn DOMException.
- Checking whether Chrome GPM has started exposing PRF on desktop.
- Checking current Firefox PRF status on the platform authenticator path.

Useful queries: `Chrome <version> WebAuthn PRF Windows Hello`, `passkeys.dev device support`, `corbado.com prf webauthn`, `developers.yubico.com PRF Extension`, `site:crbug.com WebAuthn PRF`, MDN "Use the WebAuthn API in web extensions".
