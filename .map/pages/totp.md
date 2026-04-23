# Page: totp

## Detection

- **URL pattern**: pathname contains `/oaa-totp-factor/` — specifically observed as `/oaa-totp-factor/rui/index.html`
- **DOM marker**: `document.getElementById('otpValue|input') !== null` (wait for JET render)
- **Page title**: `"CUNY Login"`

The full observed URL is `/oaa-totp-factor/rui/index.html?cid=<uuid>&nonce=<uuid>`. The `cid` and `nonce` params are session-specific. The extension matches by the substring `/oaa-totp-factor/` in the pathname.

## Context: two uses of this page

This page appears during **initial login** — CUNY challenges the user with a code from their **existing** registered authenticator (e.g., Bitwarden). It is NOT the same as the enrollment verify step (`totp-enroll-verify`), which lives at `/oaa/rui/index.html?h_ra=1`.

The instructional text on this page names the registered factor: `"Enter TOTP from the registered Bitwarden"`. The factor name is dynamic — if the user's default factor is named differently, the text changes.

## Key elements

| Purpose | Selector method | Selector value | Element type | Notes |
|---------|----------------|----------------|--------------|-------|
| OTP input | `getElementById` | `otpValue\|input` | `<input type="text">` | Pipe char in ID — **must use `getElementById`**, not `querySelector`. Class: `oj-inputtext-input oj-text-field-input oj-component-initnode` |
| Verify button | `querySelector` + text filter | `button` where `textContent.includes('Verify')` | `<button class="oj-button-button">` | **No ID**. Inner structure: `<div class="oj-button-label"><span id="_oj1\|text" class="oj-button-text">Verify</span></div>` |
| Return to All Options | `querySelector` | `a.oj-link-standalone` | `<a>` | First standalone link; navigates to factor selection |
| Switch user link | text search | `a` where text contains "Click Here" | `<a class="oj-link-standalone">` | "Not USER@login.cuny.edu? Click Here" |
| Hidden JET fields | `getElementById` | `cid\|input`, `nonce\|input`, `validationToken\|input`, `operationType\|input` | `<input type="text">` | Internal JET/OAM session fields — do not modify |

## Timing

- **Oracle JET SPA** — render is fast in practice. `domComplete` observed at **~417ms** after navigation; `otpValue|input` is present and visible immediately at page load.
- The previously documented "~15 seconds" figure was incorrect. The input is available synchronously at `domComplete`. No MutationObserver timeout adjustment needed.
- All interactive elements are present at `domComplete`. A short polling wait (500ms–1s) is sufficient as a safety margin.

## Transitions

| Action | Leads to |
|--------|----------|
| Submit correct TOTP code | `allow-gate` (`/cunylogin/pages/mfaConsent.jsp`) |
| Submit wrong TOTP code | Same page with `?emsg=Entered+TOTP+is+incorrect.` appended to URL |
| Click "Return to All Options" | Factor selection page (not fully mapped) |

## Error states

### Wrong TOTP code
- **URL changes**: The page reloads with `?emsg=Entered+TOTP+is+incorrect.` added to the URL query string. The nonce param also changes.
- **Error text**: `"Entered TOTP is incorrect."` — displayed as a `<div style="color: #C54A39;">` via a KO `if: showMessage() === 'on'` binding. No `id`, no error class — only the color style.
- **Detection**: Check `new URLSearchParams(location.search).get('emsg')` — non-null means an error was returned.
- **Input behavior**: `otpValue|input` is cleared after a wrong submission (the page reloads).
- **No `aria-invalid`** on the input after wrong submission.

## Gotchas

- **Pipe character in ID**: `otpValue|input` — `querySelector('#otpValue|input')` throws a CSS syntax error. Always use `getElementById('otpValue|input')`.
- **Verify button has no ID**: Find it with `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Verify'))`.
- **`setInputValue` WORKS for `otpValue|input`**: Confirmed — `setInputValue` (native setter + `input`/`change` events) correctly updates the JET observable on this page. Wrong code produces a server-side redirect with `?emsg=`, not a client-side "Enter a OTP code" error. This page behaves differently from `otp|input` on `totp-enroll-verify`.
- **Dynamic factor name in instructions**: The text "Enter TOTP from the registered X" includes the user's registered factor name. Do not assert on this text in tests — it will differ per user.
- **Email shown in UPPERCASE**: The "Not USER@login.cuny.edu?" text displays the email in uppercase (e.g., `ALEXANDER.MARTY98@login.cuny.edu`). Do not assert on case.
- **Session `cid`/`nonce` params**: These are single-use session tokens. Fixtures should accept any value for these params.
- **Hidden JET fields**: `cid|input`, `nonce|input`, `validationToken|input`, `operationType|input` are present but internal. Do not fill them — JET manages them.

## HTML skeleton

```html
<!-- Oracle JET SPA — all content rendered async by RequireJS/Knockout -->
<!-- Wait for #otpValue|input via MutationObserver before interacting -->

<!-- OTP input (rendered async, ~15s after load) -->
<input id="otpValue|input" type="text"
       class="oj-inputtext-input oj-text-field-input oj-component-initnode">

<!-- Verify button (no ID) -->
<button class="oj-button-button">
  <div class="oj-button-label">
    <span id="_oj1|text" class="oj-button-text">Verify</span>
  </div>
</button>

<!-- Hidden JET session fields (present synchronously or early) -->
<input id="cid|input"             type="text" aria-label="cid">
<input id="nonce|input"           type="text" aria-label="nonce">
<input id="validationToken|input" type="text" aria-label="validationToken">
<input id="operationType|input"   type="text" aria-label="operationType">

<!-- Navigation links -->
<a class="oj-link-standalone">Return to All Options</a>
<a class="oj-link-standalone">Click Here</a>
<!-- "Not USER@login.cuny.edu? Click Here" — username is dynamic -->
```
