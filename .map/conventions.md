# Conventions

Cross-cutting rules that apply to every page in this map.

## 1. Pipe characters in element IDs

Several CUNY SSO pages use `|` (pipe) in element `id` attributes:

| Element | ID |
|---------|----|
| TOTP challenge input | `otpValue|input` |
| Enrollment OTP input | `otp|input` |
| Enrollment name input | `name|input` |
| Enrollment key input | `key|input` |
| Secret label | `key-labelled-by|label` |
| JET hidden fields | `cid|input`, `nonce|input`, `validationToken|input`, `operationType|input` |

**Always use `getElementById`, never `querySelector`.**

`querySelector('#otpValue|input')` throws a `DOMException` because `|` is a CSS namespace separator. `getElementById('otpValue|input')` works correctly.

```javascript
// Correct
const input = document.getElementById('otpValue|input');

// Wrong — throws DOMException: Failed to execute 'querySelector'
const input = document.querySelector('#otpValue|input');
```

## 2. Oracle JET async rendering

The Oracle Universal Authenticator SPA (`/oaa/rui/index.html?h_ra=1`) and the TOTP challenge page (`/oaa-totp-factor/rui/`) use **Oracle JET** (RequireJS + Knockout.js). Elements render asynchronously — never attempt DOM interaction immediately after navigation.

### Observed render times

| Page | Wait time |
|------|-----------|
| `credential-entry` | ~275ms (standard HTML) |
| `credential-error` | ~275ms (standard HTML) |
| `allow-gate` | ~479ms (standard JSP) |
| `totp` | ~417ms (Oracle JET; corrected from prior ~15s assumption) |
| `factors-list` | ~20–25 seconds (Oracle JET SPA) |
| `totp-enroll-secret` | ~5 seconds (SPA view transition) |
| `totp-enroll-verify` | ~500ms–1s (SPA view transition from enroll-secret) |

### Wait strategy — MutationObserver

For Oracle JET pages, wait for the most distinctive element before interacting:

```javascript
function waitForId(id, ms = 30000) {
  return new Promise(resolve => {
    const el = document.getElementById(id);
    if (el) { resolve(el); return; }
    const t = setTimeout(() => { obs.disconnect(); resolve(null); }, ms);
    const obs = new MutationObserver(() => {
      const e = document.getElementById(id);
      if (e) { clearTimeout(t); obs.disconnect(); resolve(e); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });
}

// Usage: wait up to 30s for the TOTP input
const el = await waitForId('otpValue|input', 30000);
if (!el) throw new Error('TOTP input not found after 30s');
```

### Wait strategy — polling (MFA verify page only)

`totp-enroll-verify` and `startMfaEnrollVerifyOtpPolling` in `ssoSite.ts` use **`setInterval` at 500ms** instead of MutationObserver. The Oracle SPA re-renders form elements in ways that make observers flaky on that specific view. Match this pattern:

```javascript
const handle = setInterval(() => {
  const input = document.getElementById('otp|input');
  if (input) {
    clearInterval(handle);
    // proceed
  }
}, 500);
```

## 3. Filling Oracle JET inputs — per-input ruling

Oracle JET uses Knockout.js observables for two-way data binding. Whether `setInputValue` works depends on the specific input and page — **test each input individually**. The blanket "JET always requires fill" rule is wrong.

### Confirmed fill method per input

| Input | Page | `setInputValue` works? | Required method |
|-------|------|----------------------|-----------------|
| `#CUNYLoginUsernameDisplay` | credential-entry | ✅ Yes | `setInputValue` |
| `#CUNYLoginPassword` | credential-entry | ✅ Yes | `setInputValue` |
| `otpValue\|input` | totp (login challenge) | ✅ Yes | `setInputValue` |
| `name\|input` | totp-enroll-secret | ✅ Yes | `setInputValue` |
| `otp\|input` | totp-enroll-verify | ❌ No | Keystroke simulation |

Evidence for `otp|input` failure: `setInputValue` produced client-side "Enter a OTP code" (JET model empty). Keystroke simulation produced server-side "Incorrect code" (JET model had the value).

Evidence for `otpValue|input` and `name|input` success: Both produced server-side responses and correctly saved data when filled with `setInputValue`.

### `setInputValue` pattern

```javascript
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
)?.set;

const input = document.getElementById('CUNYLoginPassword');
nativeInputValueSetter?.call(input, 'myPassword');
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
```

### Keystroke simulation — required for `otp|input` only

For `otp|input` on `totp-enroll-verify`, use the MCP `fill` tool (simulates keystrokes) or dispatch `KeyboardEvent` per key. This correctly updates JET's Knockout.js observable for that specific input.

## 4. Clicking Oracle JET menu items

`oj-menu-button` / `oj-option` elements inside JET menus are NOT directly clickable via `getElementById('default1').click()`. The `oj-option` has `style="display: none;"` even when the menu appears visually open.

**Correct approach:**
1. Click the `oj-menu-button`'s inner `<button>` to open the menu
2. Take an accessibility tree snapshot (`take_snapshot`) to enumerate the floating menu's rendered `menuitem` elements and their UIDs
3. Click the `menuitem` UID corresponding to the desired option

## 5. SPA URL disambiguation

**Four distinct views share one URL**: `/oaa/rui/index.html?h_ra=1`. Detect the active view by DOM content. Check in this exact order (most-specific first):

```javascript
function detectSpaView() {
  if (document.getElementById('otp|input')) return 'totp-enroll-verify';
  // NOTE: [aria-labelledby="key-labelled-by|label"] is present in BOTH
  // totp-enroll-secret and totp-enroll-verify — check otp|input first.
  if (document.querySelector('[aria-labelledby="key-labelled-by|label"]')) return 'totp-enroll-secret';
  if (document.querySelector('factor-panel')) return 'factors-list';
  if (document.getElementById('categoryActionheader')) return 'oaa-spa-home';
  return 'loading'; // SPA still rendering
}
```

The `oaa-spa-home` view is the landing view after the allow-gate redirect. It renders in ~300ms. The `factors-list` view only appears after clicking "Manage" on the home view (factor panels take 19–25s to load).

## 6. Username field gotcha (credential-entry)

The credential-entry page has **two username fields**:

| ID | Purpose | User-visible |
|----|---------|-------------|
| `CUNYLoginUsernameDisplay` | Full email input (e.g., `alex@login.cuny.edu`) | Yes |
| `CUNYLoginUsername` | Short username sent to OAM (e.g., `alex`) | Hidden |

JavaScript strips the `@domain` portion from `CUNYLoginUsernameDisplay` and copies the short username to `CUNYLoginUsername` on submit. **Fill `CUNYLoginUsernameDisplay` with the full email**; the extension should never touch `CUNYLoginUsername` directly.

## 7. `#serverError` presence

`#serverError` appears **only on the `credential-error` page** (the full-page reload at `/oam/server/auth_cred_submit`). It is NOT present on the `credential-entry` page.

The extension's content script at `/oam/server/auth_cred_submit` must confirm `#serverError` exists in the DOM before emitting a `CREDENTIAL_ERROR` message. Without this check, a successful-but-transient redirect through `auth_cred_submit` (which carries no `#serverError`) would be misidentified as a credential error.

## 8. Factor data extraction

Read factor data from the `factor-panel`'s `factor` attribute as JSON — not from text content:

```javascript
const panels = Array.from(document.querySelectorAll('factor-panel'));
const data = panels.map(fp => {
  try { return JSON.parse(fp.getAttribute('factor')); }
  catch { return null; }
}).filter(Boolean);
```

Key fields: `factorAlias`, `factorIsPreferred`, `factorIsEnabled`, `factorIsValidated`, `factorKey`, `factorValue` (masked).

## 9. Timing units

All timing values in this map are in **milliseconds** unless explicitly noted otherwise. Polling intervals default to 500ms; MutationObserver timeouts default to 30000ms (30 seconds) for JET pages.

## 10. Extension-injected banner vs. native error

The extension injects a credential error banner via `src/content/banner.ts` on the `credential-error` page. This is separate from the native `#serverError` div:

| Element | Source | Selector |
|---------|--------|----------|
| `#serverError` | CUNY native | `document.getElementById('serverError')` |
| Extension banner | `banner.ts` | `div[data-cunyautologin-banner]` or by `z-index: 2147483647` (INT_MAX) |

When writing tests for the credential-error page, assert on `#serverError` for CUNY behavior and on the extension banner selector for extension behavior. Never confuse the two.
