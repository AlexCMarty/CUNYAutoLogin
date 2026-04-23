# Page: totp-enroll-secret

## Detection

- **URL pattern**: pathname is `/oaa/rui/index.html` with `?h_ra=1` — **same URL as factors-list and totp-enroll-verify**
- **DOM marker**: `document.querySelector('[aria-labelledby="key-labelled-by|label"]') !== null`
- **SPA view**: "Setup Mobile Authenticator" heading; `name|input` and `key|input` present
- **Page title**: `"CUNY Login"`

This is a SPA view within the Oracle Universal Authenticator. URL stays constant. Differentiate from `factors-list` by absence of `factor-panel` elements and presence of the secret display element. Differentiate from `totp-enroll-verify` by presence of `[aria-labelledby="key-labelled-by|label"]` and absence of `otp|input`.

**Entry**: Reached by selecting a factor type from the "Add Authentication Factor" dropdown on `factors-list`. No intermediate "add-factor" or "factor-type-select" page exists — the dropdown selection jumps directly here.

## Key elements

| Purpose | Selector method | Selector value | Element type | Notes |
|---------|----------------|----------------|--------------|-------|
| Base32 secret display | `querySelector` | `[aria-labelledby="key-labelled-by|label"]` | `<div role="textbox" aria-readonly="true">` | Text content IS the Base32 secret. Class: `oj-text-field-readonly`. |
| Secret label element | `getElementById` | `key-labelled-by\|label` | element | Pipe char in ID — use `getElementById`. Text: "Enter the key below, manually in your Authenticator Application" |
| Friendly name input | `getElementById` | `name\|input` | `<input type="text">` | Pipe char in ID. Placeholder: "Enter a friendly name". Oracle JET class: `oj-inputtext-input`. |
| Manual key input | `getElementById` | `key\|input` | `<input type="text">` | Pipe char in ID. Placeholder: "Enter an alphanumeric key". Alternative to QR scan. |
| Cancel button | text filter | `button` where text = `"Cancel"` | `<button class="oj-button-button">` | No ID. Returns to factors-list. |
| Verify Now button | text filter | `button` where text = `"Verify Now"` | `<button class="oj-button-button">` | No ID. Transitions to totp-enroll-verify view. |
| Verify Later button | text filter | `button` where text = `"Verify Later"` | `<button class="oj-button-button">` | No ID. Saves factor as Unverified, returns to factors-list. |
| QR code canvas | `querySelector` | `canvas` | `<canvas>` | Present. Contains QR code image for authenticator app scanning. |

## Timing

- **Oracle JET SPA** — view loads client-side after clicking "Add Authentication Factor" dropdown option. Render takes ~5 seconds.
- `[aria-labelledby="key-labelled-by|label"]` appears asynchronously. Use MutationObserver.
- `name|input` renders alongside the secret element.

## Transitions

| Action | Leads to |
|--------|----------|
| Click "Verify Now" | `totp-enroll-verify` SPA view (same URL, `otp|input` appears) |
| Click "Verify Later" | `factors-list` view — factor saved as Unverified |
| Click "Cancel" | `factors-list` view — no factor saved |

## Gotchas

- **Pipe chars in all IDs**: `name|input`, `key|input`, `key-labelled-by|label` — always use `getElementById`.
- **Secret is readable via TWO methods** (both work):
  1. `document.querySelector('[aria-labelledby="key-labelled-by|label"]').textContent.trim()` — from the readonly div's text content
  2. `document.getElementById('key|input').value` — `key|input` is pre-populated with the generated secret value
- **`setInputValue` WORKS for `name|input`**: Confirmed — `setInputValue` (native setter + `input`/`change` events) correctly updates the JET model for the Friendly Name field. The factor is saved with the correct name when using `setInputValue`. This is different from `otp|input` on `totp-enroll-verify`, where `setInputValue` fails.
- **`setInputValue` vs `fill` decision**: Use `setInputValue` for `name|input` (confirmed working). Use keystroke simulation (`fill` tool or `KeyboardEvent` dispatch) for `otp|input` on `totp-enroll-verify`.
- **No separate "add-factor" or "factor-type-select" pages**: These are simply the dropdown menu on `factors-list`. Selecting "Mobile Authenticator - TOTP" (id=`ChallengeOMATOTP`) from `<oj-menu id="myMenu">` navigates directly here.
- **Friendly name is required**: Clicking "Verify Now" without a name triggers a JET validation error. Clicking "Verify Later" without a name also fails (factor not saved).

## HTML skeleton

```html
<!-- Oracle Universal Authenticator SPA view — same URL as factors-list and totp-enroll-verify -->
<!-- Detect this view by: [aria-labelledby="key-labelled-by|label"] present, factor-panel absent -->

<h3>Setup Mobile Authenticator</h3>

<!-- Friendly name input (Oracle JET) -->
<label id="name-labelled-by|label">Friendly Name</label>
<input id="name|input" type="text" placeholder="Enter a friendly name"
       class="oj-inputtext-input oj-text-field-input oj-component-initnode">

<!-- Base32 secret display (read-only) -->
<label id="key-labelled-by|label">Enter the key below, manually in your Authenticator Application</label>
<div class="oj-text-field-readonly" role="textbox" aria-readonly="true"
     tabindex="0" aria-labelledby="key-labelled-by|label">
  4LBMMGX5YJDPW6QU
</div>

<!-- Manual key entry alternative -->
<input id="key|input" type="text" placeholder="Enter an alphanumeric key"
       class="oj-inputtext-input oj-text-field-input oj-component-initnode">

<!-- QR code -->
<canvas><!-- QR code rendered here --></canvas>

<!-- Action buttons (no IDs) -->
<button class="oj-button-button">Cancel</button>
<button class="oj-button-button">Verify Now</button>
<button class="oj-button-button">Verify Later</button>
```
