# Page: totp-enroll-verify

## Detection

- **URL pattern**: pathname is `/oaa/rui/index.html` with `?h_ra=1` — **same URL as factors-list and totp-enroll-secret**
- **DOM marker**: `document.getElementById('otp|input') !== null`
- **SPA view**: "Setup Mobile Authenticator" heading; `otp|input` present; "Verify and Save" button visible
- **Page title**: `"CUNY Login"`

Differentiate from `totp-enroll-secret`: `otp|input` is present; `[aria-labelledby="key-labelled-by|label"]` is still present (both views share elements — the secret is still shown, the verify code field appears below it). Differentiate from `factors-list`: `factor-panel` elements are absent.

**Entry**: Reached by clicking "Verify Now" on `totp-enroll-secret`.

## Key elements

| Purpose | Selector method | Selector value | Element type | Notes |
|---------|----------------|----------------|--------------|-------|
| OTP code input | `getElementById` | `otp\|input` | `<input type="text">` | Pipe char — **must use `getElementById`**. Placeholder: "Enter verification code". Oracle JET class. |
| Friendly name (frozen) | `getElementById` | `name\|input` | `<input type="text" readonly>` | Pre-filled with the name from previous step. Read-only in this view. |
| Secret display (still shown) | `querySelector` | `[aria-labelledby="key-labelled-by\|label"]` | `<div role="textbox">` | Secret still visible for reference. |
| Cancel button | text filter | `button` where text = `"Cancel"` | `<button class="oj-button-button">` | No ID. Returns to totp-enroll-secret or factors-list. |
| Verify and Save button | text filter | `button` where text = `"Verify and Save"` | `<button class="oj-button-button">` | No ID. Submits the OTP code to the server. |
| Inline error message | `querySelector` | `div.oj-messaging-inline-container` | `<div aria-live="polite">` | Appears after failed attempt. Contains `div.oj-message.oj-message-error > span.oj-message-content > div.oj-message-detail`. |

## Error states

### Client-side validation error (field empty / JET model not updated)
When the `otp|input` JET observable is empty (even if the raw DOM value is set), clicking "Verify and Save" shows:
- **Error text**: "Enter a OTP code"
- **Element**: `div.oj-messaging-inline-container` > `div.oj-message-error` > `div.oj-message-detail`
- **OTP input**: `aria-invalid="true"`
- **Cause**: `setInputValue` (native setter + events) does NOT reliably update JET observables here. **Always use the MCP `fill` tool or keyboard input simulation** to type into `otp|input`.

### Server-side error (wrong code)
After submitting a wrong but valid-format code:
- **Error text**: `"Incorrect code"`
- **Element**: `div.oj-messaging-inline-container` (new `id` each time, e.g., `ui-id-34`) > `div.oj-message.oj-message-error` > `div.oj-message-detail`
- **`aria-live="polite"`** on the container
- **OTP input**: `aria-invalid="true"` remains set
- **URL**: unchanged — stays on `/oaa/rui/index.html?h_ra=1`
- **Same DOM structure on first and second failure** — no distinct second-failure state on the CUNY page itself. Engineering plan's "second failure" behavior (auto-regeneration, clock-drift hint) is implemented in the extension sidebar, not triggered by a CUNY page change.

## Timing

- **Oracle JET SPA** — `otp|input` appears after "Verify Now" click via MutationObserver/polling. Poll every 500ms with `getElementById('otp|input')` per `ssoSite.ts`.
- Error message appears within ~3–5 seconds of submitting a wrong code (server round-trip).

## Transitions

| Action | Leads to |
|--------|----------|
| Submit correct code | `factors-list` view — new factor appears in list as Enabled |
| Submit wrong code | Same view — `"Incorrect code"` inline error |
| Click Cancel | `factors-list` view — **factor is saved as Unverified** (not discarded) |

**Cancel saves as Unverified — confirmed**: Clicking Cancel from `totp-enroll-verify` returns to `factors-list`, and the factor appears in the list with `factorIsValidated: false` and status "Unverified". The factor slot is consumed. This is true whether Cancel is clicked after a failed verification attempt or before any attempt. Compare with Cancel from `totp-enroll-secret`, which discards the factor entirely.

## Verify from factors-list (unverified factor path)

When a user reaches `totp-enroll-verify` via the "Verify" menu option on an existing Unverified factor (not via "Verify Now" from `totp-enroll-secret`), the view is slightly different:
- The `name|input` is still readonly with the factor's name
- The **secret display** shows the **masked value** (`R2************3Z`), NOT the full Base32 secret
- No QR code is shown
- Otherwise the OTP input and buttons are identical

## Gotchas

- **`setInputValue` does NOT work for `otp|input`**: Confirmed — dispatching `input`/`change` events on the native element leaves JET's observable empty, producing the client-side "Enter a OTP code" error. **Always use keystroke simulation** (`KeyboardEvent` dispatch or the MCP `fill` tool) to type into `otp|input`.
- **Two distinct error texts** — distinguish them:
  - `"Enter a OTP code"` = client-side (JET model empty; caused by `setInputValue`)
  - `"Incorrect code"` = server-side (JET model had a value; caused by keystroke fill)
- **Error container `id` is generated** (`ui-id-N`): Do not assert on the container's `id`. Assert on `div.oj-messaging-inline-container[aria-live="polite"]` and the text within `div.oj-message-detail > span`.
- **Full error selector path**: `div.oj-messaging-inline-container > div.oj-message.oj-message-error > span.oj-message-content > div.oj-message-detail > span`
- **`aria-invalid="true"` on `otp|input`** in both error cases. The `aria-describedby` points to the generated container ID.
- **Polling required** (not MutationObserver): Oracle SPA re-renders form elements in ways that make observers flaky on this view. The codebase uses `setInterval` at 500ms — match this pattern.
- **Secret still visible**: The `[aria-labelledby="key-labelled-by|label"]` element is present alongside `otp|input`. This is not an error — both elements coexist in this view.

## HTML skeleton

```html
<!-- Same SPA URL as factors-list and totp-enroll-secret -->
<!-- Detect this view by: otp|input present -->

<h3>Setup Mobile Authenticator</h3>

<!-- Friendly name (frozen/readonly) -->
<input id="name|input" type="text" value="claude-map-1" readonly
       class="oj-inputtext-input oj-text-field-input oj-component-initnode">

<!-- Secret still shown for reference -->
<div class="oj-text-field-readonly" role="textbox" aria-readonly="true"
     aria-labelledby="key-labelled-by|label">4LBMMGX5YJDPW6QU</div>

<!-- OTP input -->
<input id="otp|input" type="text" placeholder="Enter verification code"
       class="oj-inputtext-input oj-text-field-input oj-component-initnode">

<!-- Inline error (appears after wrong code) -->
<div class="oj-messaging-inline-container" aria-live="polite">
  <div class="oj-message oj-message-error">
    <span class="oj-message-content">
      <div class="oj-message-detail">Incorrect code</div>
    </span>
  </div>
</div>

<!-- Action buttons (no IDs) -->
<button class="oj-button-button">Cancel</button>
<button class="oj-button-button">Verify and Save</button>
```
