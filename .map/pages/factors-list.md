# Page: factors-list

## Detection

- **URL pattern**: pathname is `/oaa/rui/index.html` with `?h_ra=1` query param
- **DOM marker**: `document.querySelector('factor-panel') !== null`
- **Page title**: `"CUNY Login"` (tab title); body contains "My Authentication Factors"
- **SPA note**: Same URL as `totp-enroll-verify` and the SPA home. Differentiate by DOM content — `factor-panel` elements present = factors-list view.

This is the Oracle Universal Authenticator SPA. Navigation between views happens client-side; the URL (`/oaa/rui/index.html?h_ra=1`) stays constant.

## Key elements

| Purpose | Selector method | Selector value | Element type | Notes |
|---------|----------------|----------------|--------------|-------|
| Factor cards | `querySelectorAll` | `factor-panel` | Custom element | One per enrolled factor. Exposes full factor data as JSON in `factor` attribute. |
| Factor data (JSON) | attribute parse | `factor-panel[factor]` → parse `getAttribute('factor')` | attribute | Contains `factorAlias`, `factorIsPreferred`, `factorIsEnabled`, `factorIsValidated`, `factorValue`, etc. |
| Factor alias (name) | text search in `factor-panel` | `<span>` with `textContent === aliasName` inside a `factor-panel` | `<span>` | Text is Knockout-bound via `factorData().factorAlias`. Use `factor` attribute JSON for programmatic detection. |
| Default badge | text search | `<span class="oj-flex-item oj-sm-padding-1x-horizontal">` containing text `"Default"` | `<span>` | Present inside the `factor-panel` where `factorIsPreferred === true`. |
| Per-factor menu button | `querySelector` inside panel | `oj-menu-button.oj-button-sm` inside `factor-panel` | `<oj-menu-button>` | Has `title="Menu Button"`. One per factor. |
| Add Authentication Factor | `querySelector` | `oj-menu-button.menu-button` | `<oj-menu-button>` | Dropdown listing all enrollable factor types. |
| Add factor type options | `getElementById` | `ChallengeOMATOTP`, `ChallengeEmail`, `ChallengeFIDO2`, `ChallengeYubicoOTP` | `<oj-option>` | Inside `<oj-menu id="myMenu">`. Click the desired `oj-option` to start enrollment for that type. |

## Factor data model (from `factor-panel[factor]` JSON attribute)

```json
{
  "factorName":        "Mobile Authenticator - TOTP",
  "factorKey":         "ChallengeOMATOTP",
  "factorAttributeName": "omatotpsecretkey",
  "factorIsPreferred": true,
  "factorIsEnabled":   true,
  "factorIsValidated": true,
  "factorValue":       "LB************Y4",
  "factorAlias":       "Bitwarden",
  "factorImageURL":    "js/libs/imcs/images/phone.png",
  "factorKeyLabel":    "Key"
}
```

- `factorIsPreferred` = `true` means this factor is the current default
- `factorIsValidated` = `false` means the factor was enrolled but the OTP was never verified
- `factorValue` = masked secret (first 2 + `****` + last 2 chars of Base32 secret)
- `factorAlias` = user-given label (e.g., "Bitwarden", "CUNYAutoLogin")

## Per-factor menu options (indexed by `properties.index` = `indexAttr`)

**Critical:** `{N}` in per-factor menu IDs (`default{N}`, `delete{N}`, etc.) is the `index` attribute value on the `factor-panel` element — **NOT the DOM position**. The `index` attribute is server-assigned and may not match DOM order.

Example: a `factor-panel` at DOM position 2 may have `index="3"`, giving it menu IDs `default3`, `delete3`, etc.

Always locate the target panel by `factorAlias` from the JSON `factor` attribute, then read its `index` attribute to know the `{N}` suffix.

| `oj-option` id | value | Shown when |
|----------------|-------|------------|
| `default{N}` | `"default"` | factor is not preferred, is enabled, **and is validated** |
| `removeDefault{N}` | `"removeDefault"` | factor is preferred and enabled |
| `disable{N}` | `"disable"` | factor is enabled **and is validated** |
| `enable{N}` | `"enable"` | factor is disabled and is validated |
| `verify{N}` | `"verify"` | factor is unverified (`factorIsValidated === false`) |
| `delete{N}` | `"delete"` | always present |

For an **unverified factor**, only `verify{N}` and `delete{N}` are visible in the rendered menu (all others have `style="display: none;"` via KO binding).

## Add Authentication Factor — dropdown options

| `oj-option` id | Visible label |
|----------------|---------------|
| `ChallengeOMATOTP` | Mobile Authenticator - TOTP |
| `ChallengeEmail` | Prospective CUNY Students Only |
| `ChallengeFIDO2` | PassKey (FIDO) |
| `ChallengeYubicoOTP` | Yubikey |

## Timing

- **Oracle JET SPA** — `factor-panel` elements appear ~19–25 seconds after clicking "Manage" on the home view.
- After clicking Manage: the heading ("My Authentication Factors") and "Add Authentication Factor" button appear first (within ~1s). `factor-panel` elements arrive later via the factor API.
- Use MutationObserver on `document.documentElement` watching for `factor-panel` elements.
- The SPA stays at the same URL when navigating between views. **The home view (`oaa-spa-home`) loads first**; click `oj-button#createNewCategory`'s inner button to transition here. See `oaa-spa-home.md`.
- The "Add Authentication Factor" button ID is `menuButton` (not just a class selector — the element has `id="menuButton"`).

## DOM states

### Normal state (< 5 TOTP factors)
`oj-menu-button.menu-button` ("Add Authentication Factor") is present, enabled (`oj-enabled`), and the `ChallengeOMATOTP` option inside it is interactive.

### TOTP-limit state (5 TOTP factors — confirmed at exactly 5)
The "Add Authentication Factor" button (`oj-menu-button.menu-button`) **remains enabled and visible**. However, the `ChallengeOMATOTP` `oj-option` inside the dropdown gains the class `oj-disabled` and becomes unclickable. Other factor types (Email, FIDO2, YubiKey) are unaffected.

Detection:
```javascript
// After opening the Add dropdown, check if TOTP option is disabled
const totpOption = document.getElementById('ChallengeOMATOTP');
const totpDisabled = totpOption?.classList?.contains('oj-disabled'); // true = limit reached
```

The limit is **5 TOTP factors per account**. The button itself does not change — only the TOTP `oj-option` inside it gains `oj-disabled`.

### CUNYAutoLogin-already-exists detection (Path B)
```javascript
// Detect if a factor named "CUNYAutoLogin" is already enrolled
const panels = Array.from(document.querySelectorAll('factor-panel'));
const existing = panels.find(fp => {
  try { return JSON.parse(fp.getAttribute('factor'))?.factorAlias === 'CUNYAutoLogin'; }
  catch { return false; }
});
// existing !== undefined means the factor exists
```

### Default badge detection (after "Set As Default")
```javascript
// Detect which factor is currently the default
const panels = Array.from(document.querySelectorAll('factor-panel'));
const defaultPanel = panels.find(fp => {
  try { return JSON.parse(fp.getAttribute('factor'))?.factorIsPreferred === true; }
  catch { return false; }
});
// Or by visible DOM:
const defaultBadge = Array.from(document.querySelectorAll('factor-panel span'))
  .find(s => s.textContent.trim() === 'Default');
const defaultPanel2 = defaultBadge?.closest('factor-panel');
```

## Transitions

| Action | Leads to |
|--------|----------|
| Click "Add Authentication Factor" → select type | `totp-enroll-secret` (for TOTP) or other enrollment flow |
| Click "Menu Button" → "Set As Default" | Same page, `factorIsPreferred` flips on selected factor |
| Click "Menu Button" → "Delete" | Same page, factor removed |
| Click "Menu Button" → "Verify" | `totp-enroll-verify` SPA view |

## Status icons (confirmed)

| Status | Image src | Alt text | Text span |
|--------|-----------|----------|-----------|
| Enabled | `js/libs/imcs/images/success-g.png` | `"Enabled"` | `"Enabled"` |
| Unverified | `js/libs/imcs/images/unverified-s.png` | `"Unverified"` | `"Unverified"` |
| Default badge (preferred) | `js/libs/imcs/images/Oval.png` | `"Mobile Authenticator - TOTP preferred"` | `"Default"` |

Status text and icon are both inside the `factor-panel`. Detect status by the image `alt` attribute or the adjacent `<span>` text.

## Set-as-Default timing

After clicking the "Set As Default" menuitem, `factorIsPreferred` flips in the `factor-panel`'s `factor` JSON attribute in approximately **1.1–1.2 seconds** (observed: 1151ms, 1180ms). Poll every 50–200ms with a 5-second timeout.

## Gotchas

- **Oracle JET custom elements** (`oj-menu-button`, `oj-menu`, `oj-option`) — use `.click()` on the inner `<button>` if clicking the custom element fails.
- **Menu item IDs use `index` attribute, NOT DOM order** — `{N}` in `default{N}`, `delete{N}`, etc. corresponds to the `index` attribute on `factor-panel`, which is server-assigned and may differ from DOM position. Always find the panel by `factorAlias`, then use its `index` attribute for the menu ID suffix.
- **Programmatic `oj-option` click after menu open works**: `document.getElementById('ChallengeOMATOTP')?.click()` succeeds after the outer `oj-menu-button`'s inner `<button>` has been clicked to open the menu. The `display: none` CSS on `oj-option` does not prevent programmatic click event firing.
- **"Default" badge appears/disappears without URL change** — it's a Knockout observable. Poll `factor-panel[factor]` JSON attribute every ~50ms; `factorIsPreferred` flips within ~1.2 seconds.
- **SPA navigation**: clicking "Manage" on the home screen initiates a client-side view transition. The URL stays `/oaa/rui/index.html?h_ra=1`. Wait for `factor-panel` elements to appear after clicking (up to 25s).

## HTML skeleton (single factor card)

```html
<!-- factor-panel custom element — one per enrolled factor -->
<factor-panel
  factor='{"factorName":"Mobile Authenticator - TOTP","factorKey":"ChallengeOMATOTP","factorAttributeName":"omatotpsecretkey","factorIsPreferred":true,"factorIsEnabled":true,"factorIsValidated":true,"factorValue":"LB************Y4","factorAlias":"Bitwarden","factorImageURL":"js/libs/imcs/images/phone.png","factorKeyLabel":"Key"}'
  index="0"
  class="oj-complete">

  <div class="oj-panel oj-panel-shadow-lg oj-sm-padding-2x oj-sm-margin-6x-top">
    <div class="oj-flex oj-sm-flex-items-1 oj-sm-align-items-center">

      <!-- Factor type icon -->
      <img src="js/libs/imcs/images/phone.png" alt="Mobile Authenticator - TOTP">

      <!-- Factor type label -->
      <div class="factor-panel-wrap oj-flex-item">
        <span>Mobile Authenticator - TOTP</span>
      </div>

      <!-- Per-factor menu button -->
      <oj-menu-button class="oj-button-sm oj-button oj-component oj-enabled oj-default
                             oj-button-half-chrome oj-button-icon-only oj-complete"
                      title="Menu Button">
        <button class="oj-button-button" aria-haspopup="true">
          <span class="oj-button-text oj-helper-hidden-accessible">Menu Button</span>
        </button>
        <oj-menu slot="menu" id="ui-id-17">
          <oj-option id="default0"       value="default">Set As Default</oj-option>
          <oj-option id="removeDefault0" value="removeDefault">Remove Default</oj-option>
          <oj-option id="disable0"       value="disable">Disable</oj-option>
          <oj-option id="enable0"        value="enable">Enable</oj-option>
          <oj-option id="verify0"        value="verify">Verify</oj-option>
          <oj-option id="delete0"        value="delete">Delete</oj-option>
        </oj-menu>
      </oj-menu-button>
    </div>

    <!-- Factor alias row -->
    <div class="oj-flex oj-flex-item oj-sm-7">
      <span>Bitwarden</span>  <!-- factorAlias -->
      <!-- "Default" badge — only present when factorIsPreferred === true -->
      <span class="oj-flex-item oj-sm-padding-1x-horizontal">Default</span>
    </div>

    <!-- Masked secret value -->
    <span>LB************Y4</span>

    <!-- Status: "Enabled", "Disabled", or "Unverified" -->
    <span>Enabled</span>
  </div>
</factor-panel>

<!-- "Add Authentication Factor" dropdown -->
<oj-menu-button class="menu-button oj-button oj-component oj-enabled oj-default
                        oj-button-full-chrome oj-button-text-icon-end oj-complete">
  <button class="oj-button-button">Add Authentication Factor</button>
  <oj-menu slot="menu" id="myMenu">
    <oj-option id="ChallengeOMATOTP">Mobile Authenticator - TOTP</oj-option>
    <oj-option id="ChallengeEmail">Prospective CUNY Students Only</oj-option>
    <oj-option id="ChallengeFIDO2">PassKey (FIDO)</oj-option>
    <oj-option id="ChallengeYubicoOTP">Yubikey</oj-option>
  </oj-menu>
</oj-menu-button>
```
