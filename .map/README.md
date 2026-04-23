# CUNY SSO Site Map

This directory is a versioned, AI-optimized reference for the live CUNY SSO login flow at `https://ssologin.cuny.edu/*`. It was produced by navigating the live site with a real account and capturing selectors, timing, DOM structure, and transition behavior directly from the browser.

**Use this to write Playwright fixtures, integration tests, and onboarding automation without opening a browser.**

## Entry point

```
https://ssologin.cuny.edu/oamfed/idp/samlv20?...
  → redirects to →
https://ssologin.cuny.edu/oam/server/obrareq.cgi?...
```

This is the credential entry page. Navigation from a service (CUNYfirst, Blackboard, etc.) lands here.

## Page inventory

| Slug | URL | Notes |
|------|-----|-------|
| [credential-entry](pages/credential-entry.md) | `/oam/server/obrareq.cgi` | Standard HTML login form (NOT Oracle JET) |
| [credential-error](pages/credential-error.md) | `/oam/server/auth_cred_submit` | Full-page reload with `#serverError` after wrong credentials |
| [totp](pages/totp.md) | `/oaa-totp-factor/rui/index.html?cid=…&nonce=…` | Oracle JET; challenge with existing factor during login; renders in ~417ms |
| [allow-gate](pages/allow-gate.md) | `/cunylogin/pages/mfaConsent.jsp` | OAuth consent; appears after **every** successful TOTP login |
| [oaa-spa-home](pages/oaa-spa-home.md) | `/oaa/rui/index.html?h_ra=1` | **New.** SPA landing view after allow-gate; must click Manage to reach factors-list |
| [factors-list](pages/factors-list.md) | `/oaa/rui/index.html?h_ra=1` | **Same URL** as home — Oracle Universal Authenticator SPA — enrolled factors |
| [totp-enroll-secret](pages/totp-enroll-secret.md) | `/oaa/rui/index.html?h_ra=1` | **Same URL** — SPA view with TOTP secret and QR code |
| [totp-enroll-verify](pages/totp-enroll-verify.md) | `/oaa/rui/index.html?h_ra=1` | **Same URL** — SPA view for OTP code entry |
| [factors-list-post-enroll](pages/factors-list-post-enroll.md) | `/oaa/rui/index.html?h_ra=1` | Not a separate page — documents observable DOM after enrollment |

## Critical: the Oracle Universal Authenticator SPA

**Four distinct views share one URL**: `/oaa/rui/index.html?h_ra=1`

Differentiate by DOM content only. Check in this order (most-specific first):

| DOM condition | View |
|---------------|------|
| `document.getElementById('otp\|input') !== null` | `totp-enroll-verify` |
| `document.querySelector('[aria-labelledby="key-labelled-by\|label"]') !== null` | `totp-enroll-secret` |
| `document.querySelector('factor-panel') !== null` | `factors-list` |
| `document.getElementById('categoryActionheader') !== null` | `oaa-spa-home` |
| (none of the above) | loading |

**Order matters**: `[aria-labelledby="key-labelled-by|label"]` is present in BOTH `totp-enroll-secret` AND `totp-enroll-verify`. Check `otp|input` first.

Never detect these views by URL alone.

## How to read this directory

- Each page file in `pages/` follows a fixed structure: Detection → Key elements → Timing → Transitions → Gotchas → HTML skeleton.
- `graph.yaml` encodes the transition graph as a state machine. Read it to understand which user actions lead to which pages.
- `conventions.md` contains cross-cutting rules that apply to all pages: selector patterns, Oracle JET async behavior, confirmed `setInputValue` vs keystroke simulation per input, timing units.

## What this map does NOT cover

- The factor selection page for non-TOTP factors (Email, FIDO2, YubiKey) — reachable via "Return to All Options" on the TOTP challenge page
- Any page behind a CUNY service login (CUNYfirst, Blackboard, etc.) — only `ssologin.cuny.edu` is in scope

## Key findings added in this revision

- **Allow-gate appears every login** (not one-time consent)
- **Deny path confirmed**: raw JSON error at `/oaa/rui/oidc/redirect?error=access_denied`
- **Allow-gate redirects to `oaa-spa-home`** (not directly to `factors-list`)
- **TOTP page renders in ~417ms** (not 15 seconds as previously documented)
- **Wrong TOTP → URL reload** with `?emsg=Entered+TOTP+is+incorrect.` (not inline SPA error)
- **`setInputValue` works** for `otpValue|input` (login TOTP) and `name|input` (enrollment name)
- **`otp|input` requires keystroke simulation** (enrollment verify code only)
- **Cancel from `totp-enroll-verify` saves factor as Unverified** (not discarded)
- **TOTP limit is 5 per-type**: `ChallengeOMATOTP` gains `oj-disabled` class; Add button stays visible
- **`oj-option` menu IDs use `index` attribute** (not DOM position)
- **Set-as-Default propagates in ~1.2 seconds** after menu click
- **`oaa-spa-home` documented**: `id="createNewCategory"` for Manage button, renders ~300ms
