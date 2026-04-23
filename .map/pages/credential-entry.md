# Page: credential-entry

## Detection

- **URL pattern**: pathname contains `/oam/server/obrareq.cgi` OR `/oamfed/idp/samlv20`
- **Entry point**: `https://ssologin.cuny.edu/oaa/rui` redirects here immediately
- **DOM marker**: `document.getElementById('CUNYLoginUsernameDisplay') !== null`
- **Page title**: `"CUNY Login"`

The URL contains a long `encquery` parameter (encrypted OAuth/OAM state). Fixtures should use a simplified path like `/oam/server/obrareq.cgi` with any query string; the extension matches by substring.

## Key elements

| Purpose | Selector method | Selector value | Element type | Notes |
|---------|----------------|----------------|--------------|-------|
| Username input (visible) | `getElementById` | `CUNYLoginUsernameDisplay` | `<input type="text">` | User types full email here; `name="usernameDisplay"` |
| Username input (hidden) | `getElementById` | `CUNYLoginUsername` | `<input type="hidden">` | `name="username"` — what OAM actually receives. JS strips the `@domain` on submit, posting only the short username (e.g. `firstname.lastname01`). Set this field too when simulating a real POST. |
| Password input | `getElementById` | `CUNYLoginPassword` | `<input type="password">` | `name="password"` |
| Show password toggle | `querySelector` | `.btn-toggle-password` | `<button type="button">` | Toggles password field between `type="password"` and `type="text"` |
| Submit button | `getElementById` | `submit` | `<button type="submit" name="submit">` | Text: "Log in"; classes: `btn btn-login btn-lg btn-primary btn-block` |
| Username validation error | `getElementById` | `vLogin` | `<div>` | Hidden by default (`visually-hidden`); shown on client-side validation failure |
| Password validation error | `getElementById` | `vPassword` | `<div>` | Hidden by default (`visually-hidden`); shown on client-side validation failure |
| Server error banner | `getElementById` | `serverError` | `<div role="alert">` | **Not present on this page** — only appears on the `credential-error` page after redirect |
| Login form | `getElementById` | `loginForm` | `<form method="post">` | `action="/oam/server/auth_cred_submit"`, `novalidate` (JS-managed validation) |

## Timing

- **Not Oracle JET** — standard server-rendered HTML. `domInteractive` observed at ~275–382ms.
- All form elements are present synchronously at `DOMContentLoaded`. No MutationObserver needed.
- `CUNYLoginUsernameDisplay` receives focus automatically on page load (JS: `uDisp.focus()`).

## Username normalization (critical gotcha)

The form submit handler does the following before POSTing:
1. Reads the display field value (e.g. `alexander.marty98@login.cuny.edu`)
2. Strips everything after `@` → `alexander.marty98`
3. Writes the short name into the hidden `#CUNYLoginUsername` field
4. OAM receives `username=alexander.marty98` (not the full email)

When filling credentials via `setInputValue`, dispatching `input`/`change` events on the display field is sufficient — the hidden field sync happens in the form's `submit` event listener, which fires naturally when the submit button is clicked.

## Transitions

| Action | Leads to |
|--------|----------|
| Submit with correct credentials | `totp` (if MFA enrolled) or post-login app (if no MFA) |
| Submit with wrong credentials | `credential-error` (URL redirect to `/oam/server/auth_cred_submit`) |
| Client-side validation fails (empty fields) | Stays on same URL; inline `#vLogin` / `#vPassword` errors shown |

## Gotchas

- **Two username fields**: The visible `#CUNYLoginUsernameDisplay` is for the user; the hidden `#CUNYLoginUsername` is what OAM actually authenticates against. The extension must fill the visible field (the submit handler normalizes it). Do NOT write the short name directly to the hidden field — CUNY may change this normalization logic.
- **`setInputValue` pattern required**: Native setter + `input`/`change` events needed so the form's validation clear-on-type listeners fire. Without this, client-side validation errors from a prior attempt remain visible.
- **No Oracle JET**: Unlike the TOTP pages, this page is plain HTML. No async rendering delay. Elements are available immediately after `DOMContentLoaded`.
- **`novalidate` on form**: Browser-native validation is suppressed. All validation is done in the inline JS.
- **Security message**: A live region (`aria-live="polite"`) below the submit button reads "For your security, be sure to log out and close your browser when done."

## HTML skeleton

```html
<form id="loginForm" name="loginform" method="post"
      action="/oam/server/auth_cred_submit" autocomplete="on" novalidate>
  <h2 id="form-title" class="visually-hidden">Login Form</h2>

  <div class="form-row">
    <label for="CUNYLoginUsernameDisplay" class="form-label">CUNY Login</label>
    <input type="text" class="form-control" id="CUNYLoginUsernameDisplay"
           name="usernameDisplay" autocomplete="username" autocapitalize="none"
           spellcheck="false" aria-describedby="vLogin" required>
    <!-- Hidden field: OAM receives this as "username" (short name, no @domain) -->
    <input type="hidden" name="username" id="CUNYLoginUsername" autocomplete="off">
    <div id="vLogin" class="error-message visually-hidden">
      Please enter your CUNY Login.
    </div>
  </div>

  <div class="form-row">
    <label for="CUNYLoginPassword" class="form-label">Password</label>
    <div class="password-group">
      <input type="password" class="form-control" id="CUNYLoginPassword"
             name="password" autocomplete="current-password"
             aria-describedby="vPassword" required>
      <button type="button" class="btn btn-toggle-password"
              aria-controls="CUNYLoginPassword" aria-label="Show password"
              aria-pressed="false" title="Show password">
        <span class="visually-hidden">Show password</span>
      </button>
    </div>
    <div id="vPassword" class="error-message visually-hidden">
      Please enter a password.
    </div>
  </div>

  <button name="submit" id="submit"
          class="btn btn-login btn-lg btn-primary btn-block" type="submit">
    Log in
  </button>
</form>
```
