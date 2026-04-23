# Page: allow-gate

## Detection

- **URL pattern**: pathname is `/cunylogin/pages/mfaConsent.jsp`
- **DOM marker**: `document.getElementById('consent_frm') !== null` OR `document.querySelector('button[onclick="allow()"]') !== null`
- **Page title**: `"CUNY Login MFA Consent"`

This page appears immediately after a successful TOTP challenge. It is an OAuth consent screen asking the user to grant the MFA self-service application access.

**Frequency: appears on EVERY successful TOTP login** — not just the first time. The allow-gate is not a one-time consent; it is required every login session where the user goes through TOTP. The extension's non-onboarding fill path (auto-fill via vault) also hits this page after successfully filling TOTP.

## Key elements

| Purpose | Selector method | Selector value | Element type | Notes |
|---------|----------------|----------------|--------------|-------|
| Consent form | `getElementById` | `consent_frm` | `<form method="post">` | POSTs to `/oauth2/rest/approval` |
| Allow button | text / onclick | `button[onclick="allow()"]` | `<button type="button" class="btn-login">` | **No ID or name**. Calls `allow()` JS function which sets `#act` value and submits form |
| Deny button | text / onclick | `button[onclick="deny()"]` | `<button type="button" class="btn-login">` | Calls `deny()` JS function |
| Page heading | `getElementById` | `logout-title` | `<h1 id="logout-title">` | Text: "Allow CUNY Login to access MFA Self-service?" Note: ID is `logout-title`, NOT `consent-heading` |
| OAuth state field | `getElementById` | `state` | `<input type="hidden" name="state">` | Session-specific OAuth state token |
| Act field | `getElementById` | `act` | `<input type="hidden" name="act">` | Set to `"allow"` or `"deny"` by JS before form submit |
| Skip form | `getElementById` | `consent_frm_skip` | `<form method="GET">` | Hidden secondary form; POSTs to `/oauth2/rest/approval/skip`. Internal use; do not interact with it. |

## Timing

- **Not Oracle JET** — standard server-rendered JSP. `domInteractive` observed at **~479ms**.
- All elements present synchronously. No MutationObserver needed.

## Transitions

| Action | Leads to |
|--------|----------|
| Click Allow | `oaa-spa-home` (Oracle Universal Authenticator SPA at `/oaa/rui/index.html?h_ra=1`) |
| Click Deny | Raw JSON error page at `/oaa/rui/oidc/redirect?error=access_denied&state=...` |

## Deny path — confirmed

Clicking Deny redirects to `/oaa/rui/oidc/redirect` with query `?error=access_denied&state=%2Foaa%2Frui%2Fuser%2Fv1`. The page renders raw JSON:

```json
{"error": "access_denied", "error_description": "Failed to process authorization request. ..."}
```

No user-friendly error is shown. The OAM session remains valid after Deny — navigating back to the SPA shows the home view, but factor API calls return 401 (no OAuth token). A fresh full login is required to re-acquire the token.

## Gotchas

- **Heading ID is `logout-title`**, not `consent-heading` — the original map had the wrong ID. Use `document.getElementById('logout-title')`.
- **`stateAjax` field is absent** — this field was documented in the original map but is not present in the live page. A `stateSkip` field exists inside `#consent_frm_skip` instead.
- **Buttons have no ID or name** — find by `onclick` attribute: `button[onclick="allow()"]` and `button[onclick="deny()"]`.
- **`onclick` calls JS functions**, not a native form submit — clicking the button triggers `allow()` / `deny()` which sets `#act` and then calls `form.submit()`.
- **Session-scoped URL**: The `state` query param is a single-use encrypted token. Fixtures should accept any value.
- **Same-domain as SSO**: Despite the different path (`/cunylogin/` vs `/oam/`), this page is still on `https://ssologin.cuny.edu` and is within the extension's content script match pattern.
- **Allow redirects to `oaa-spa-home`, NOT directly to `factors-list`**: The extension must wait for `factor-panel` elements after Allow; they won't appear immediately — the home view loads first and "Manage" must be clicked.

## HTML skeleton

```html
<main id="main" class="signin-main">
  <section class="login-section" aria-labelledby="logout-title">
    <div class="auth-shell logout-shell">
      <div class="auth-panel">
        <div class="login-container text-center">
          <!-- NOTE: heading ID is "logout-title", not "consent-heading" -->
          <h1 id="logout-title" class="logout-title mb-3">
            Allow CUNY Login to access MFA Self-service?
          </h1>
          <div class="lead">
            <form action="/oauth2/rest/approval" method="post" id="consent_frm">
              <p>To set up or manage your CUNY Login MFA authentication factor(s),<br>
                 you must allow CUNY Login to access to the MFA self-service application.</p>
              <p>Click <strong>Allow</strong> to continue.</p>

              <input type="hidden" name="state" id="state" value="<session-token>">
              <input type="hidden" name="act"   id="act"   value="">

              <div style="display: flex; justify-content: center; margin-top: 15px;">
                <div style="margin-right: 30px;">
                  <button type="button" class="btn-login" style="min-width: 120px;" onclick="deny()">Deny</button>
                </div>
                <div>
                  <button type="button" class="btn-login" style="min-width: 120px;" onclick="allow()">Allow</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </section>
</main>

<!-- Secondary hidden skip form — do not interact -->
<form action="/oauth2/rest/approval/skip" method="GET" id="consent_frm_skip">
  <input type="hidden" name="state" id="stateSkip" value="<session-token>">
</form>
```
