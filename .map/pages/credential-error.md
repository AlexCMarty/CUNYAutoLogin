# Page: credential-error

## Detection

- **URL pattern**: pathname is exactly `/oam/server/auth_cred_submit`
- **DOM marker**: `document.getElementById('serverError') !== null`
- **Page title**: `"CUNY Login"` (same as credential-entry)

This page is the POST target of the login form. On wrong credentials, OAM responds with a full page reload at this URL containing the error banner in the server-rendered HTML.

## Key elements

| Purpose | Selector method | Selector value | Element type | Notes |
|---------|----------------|----------------|--------------|-------|
| Error banner | `getElementById` | `serverError` | `<div role="alert">` | Server-rendered; `aria-live="assertive"`, `aria-atomic="true"`, `tabindex="-1"`. Auto-focused by inline JS on page load. |
| Error icon | `querySelector` | `#serverError .login-error-icon` | `<span aria-hidden="true">` | Contains literal `!` character |
| Error text | `querySelector` | `#serverError .login-error-text` | `<p>` | Contains `<strong>` with error message |
| Login form | `getElementById` | `loginForm` | `<form method="post">` | Same form as `credential-entry`; username field is **empty** (not pre-populated) |
| Username input | `getElementById` | `CUNYLoginUsernameDisplay` | `<input type="text">` | Present and empty; user must re-enter |
| Password input | `getElementById` | `CUNYLoginPassword` | `<input type="password">` | Present and empty |
| Submit button | `getElementById` | `submit` | `<button type="submit">` | Text: "Log in" |

## Error text content (live observed)

```
Incorrect Username or Password. Please enter your CUNY Login username (firstname.lastname##) and password.
```

The text is wrapped in `<strong>` inside `.login-error-text > p`. The extension's `hasCredentialErrorInDom` checks for the substring `"Incorrect Username or Password"` — confirmed correct.

## Timing

- **Full page reload** — server-rendered. `domInteractive` at ~382ms.
- `#serverError` is present synchronously in the DOM (no async rendering).
- JS auto-focuses `serverError` on page load: `serverError.focus()`.

## Error path: redirect vs inline re-render

**Observed on live site**: URL redirect only. The form POSTs to `/oam/server/auth_cred_submit` and OAM returns a full new HTML page with `#serverError` baked in.

**Inline re-render path**: Not observed on the live site. The codebase's `hasCredentialErrorInDom` guard (checking for `#serverError` without a URL change) exists as a safety net but was not triggered in testing. Fixtures use `?wrong=1` to simulate this path.

## Extension-injected error banner (banner.ts)

When the extension detects a credential error, `src/content/banner.ts` injects an additional banner element onto this page **alongside** the native `#serverError`. This is distinct from CUNY's own error:

- **Not a native CUNY element** — extension-authored with inline styles
- **High z-index** (`INT_MAX`) to appear above CUNY's CSS
- Agents writing tests must distinguish: `#serverError` = CUNY's native error; the injected banner = extension feedback
- The banner is mounted idempotently (safe to call `mount()` multiple times)
- The banner is unmounted when the extension calls `unmount()` or the page navigates away
- See `src/content/banner.ts` for the injected element structure and selector

## Transitions

| Action | Leads to |
|--------|----------|
| Fill correct credentials and submit | `totp` |
| Fill wrong credentials again and submit | `credential-error` (same URL, full reload) |

## Gotchas

- **Username not pre-populated**: Unlike some SSO systems, CUNY does not pre-fill the username on the error page. The user must re-enter it.
- **Same page title as credential-entry**: Both pages say "CUNY Login". Differentiate by URL pathname or `#serverError` presence.
- **`serverError` auto-focused**: Screen readers will announce the error immediately. Fixtures should replicate `tabindex="-1"` and the focus call if testing accessibility flows.
- **`aria-live="assertive"` + `role="alert"`**: Double-assertive announcement. Some browsers may announce the error twice if both are present. Document but do not change in fixtures.

## HTML skeleton

```html
<!-- Server-rendered on /oam/server/auth_cred_submit — full page, not a fragment -->
<!-- The login form is identical to credential-entry, plus #serverError above it -->

<div id="serverError"
     class="login-error message-row show"
     role="alert"
     aria-live="assertive"
     aria-atomic="true"
     tabindex="-1">
  <span class="login-error-icon" aria-hidden="true">!</span>
  <p class="login-error-text">
    <strong>Incorrect Username or Password. Please enter your CUNY Login username (firstname.lastname##) and password. </strong>
  </p>
</div>

<!-- Same login form as credential-entry follows, with empty username/password fields -->
<form id="loginForm" name="loginform" method="post"
      action="/oam/server/auth_cred_submit" autocomplete="on" novalidate>
  <!-- ... identical to credential-entry form skeleton ... -->
</form>
```
