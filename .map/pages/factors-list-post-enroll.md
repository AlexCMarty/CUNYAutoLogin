# Page: factors-list-post-enroll

## Detection

Identical to `factors-list` — this is NOT a separate page. Same URL, same DOM marker:

- **URL pattern**: pathname is `/oaa/rui/index.html` with `?h_ra=1`
- **DOM marker**: `document.querySelector('factor-panel') !== null`

This file documents **observable DOM differences** after a new factor is successfully enrolled (i.e., what the factors-list page looks like immediately post-enrollment), including default badge detection and the newly enrolled factor's appearance.

## What changes after enrollment

After submitting a correct OTP on `totp-enroll-verify`, the SPA transitions back to `factors-list`. The newly enrolled factor appears as a new `factor-panel` element with:

- `factorIsEnabled: true`
- `factorIsValidated: true`
- `factorIsPreferred: false` (it is NOT the default unless explicitly set)

Status text inside the panel reads **"Enabled"**.

If "Verify Later" was used instead, the factor appears with `factorIsValidated: false` and status text **"Unverified"**. Its per-factor menu includes a `verify{N}` option.

## Default badge — confirmed DOM structure

The preferred factor's `factor-panel` contains two distinct DOM markers:

1. **Preferred icon image** — `<img alt="Mobile Authenticator - TOTP preferred" src="js/libs/imcs/images/Oval.png">` (the image alt includes the word "preferred"; the src is `Oval.png`)
2. **"Default" text span** — `<span class="oj-flex-item oj-sm-padding-1x-horizontal">Default</span>`

Both are present inside the preferred panel simultaneously. The `factor` attribute JSON also reflects `"factorIsPreferred": true`.

### Reliable detection patterns

```javascript
// Most reliable: JSON attribute (no DOM traversal dependency)
const preferredPanel = Array.from(document.querySelectorAll('factor-panel'))
  .find(fp => {
    try { return JSON.parse(fp.getAttribute('factor'))?.factorIsPreferred === true; }
    catch { return false; }
  });

// DOM-based: "Default" span text
const defaultBadge = Array.from(document.querySelectorAll('factor-panel span'))
  .find(s => s.textContent.trim() === 'Default');
const defaultPanel = defaultBadge?.closest('factor-panel');

// DOM-based: preferred icon img (alt contains "preferred")
const preferredImg = document.querySelector('factor-panel img[alt*="preferred"]');
const defaultPanel2 = preferredImg?.closest('factor-panel');
```

## Set As Default flow

To set a newly enrolled factor as default:
1. Identify the factor-panel by `factorAlias` from the JSON attribute
2. Click the `oj-menu-button.oj-button-sm` inside that panel (the "Menu Button")
3. Wait for the floating menu to open (take_snapshot to get UIDs)
4. Click the `default{N}` option's `menuitem` UID — **NOT the `oj-option` element** (it has `display:none`)
5. Poll `factor-panel[factor]` JSON until `factorIsPreferred` flips to `true` on the target panel
6. Confirm: "Default" span appears inside that panel; previous default panel loses its span

### Why direct oj-option click fails

`document.getElementById('default1')` has `style="display: none;"` even after the menu is visually open. The `oj-option` elements are in the shadow/virtual DOM; the rendered `menuitem` elements are floating overlays accessible only via accessibility tree snapshot UIDs.

## Newly enrolled factor row — HTML skeleton

```html
<!-- factor-panel for a just-enrolled factor (Enabled, not default) -->
<factor-panel
  factor='{"factorName":"Mobile Authenticator - TOTP","factorKey":"ChallengeOMATOTP","factorAttributeName":"omatotpsecretkey","factorIsPreferred":false,"factorIsEnabled":true,"factorIsValidated":true,"factorValue":"4L**********QU","factorAlias":"claude-map-1","factorImageURL":"js/libs/imcs/images/phone.png","factorKeyLabel":"Key"}'
  index="1"
  class="oj-complete">

  <div class="oj-panel oj-panel-shadow-lg oj-sm-padding-2x oj-sm-margin-6x-top">
    <div class="oj-flex oj-sm-flex-items-1 oj-sm-align-items-center">
      <img src="js/libs/imcs/images/phone.png" alt="Mobile Authenticator - TOTP">
      <div class="factor-panel-wrap oj-flex-item">
        <span>Mobile Authenticator - TOTP</span>
      </div>
      <oj-menu-button class="oj-button-sm ..." title="Menu Button">
        <button class="oj-button-button" aria-haspopup="true">
          <span class="oj-button-text oj-helper-hidden-accessible">Menu Button</span>
        </button>
        <oj-menu slot="menu" id="ui-id-22">
          <oj-option id="default1"       value="default">Set As Default</oj-option>
          <oj-option id="removeDefault1" value="removeDefault">Remove Default</oj-option>
          <oj-option id="disable1"       value="disable">Disable</oj-option>
          <oj-option id="enable1"        value="enable">Enable</oj-option>
          <oj-option id="verify1"        value="verify">Verify</oj-option>
          <oj-option id="delete1"        value="delete">Delete</oj-option>
        </oj-menu>
      </oj-menu-button>
    </div>

    <!-- No preferred icon — not the default -->
    <!-- No "Default" span — not the default -->

    <div class="oj-flex oj-flex-item oj-sm-7">
      <span>claude-map-1</span>  <!-- factorAlias -->
    </div>
    <span>4L**********QU</span>   <!-- masked secret -->
    <span>Enabled</span>          <!-- status -->
  </div>
</factor-panel>
```

## Default factor row — HTML skeleton (for comparison)

```html
<!-- factor-panel for the preferred/default factor -->
<factor-panel
  factor='{"factorName":"Mobile Authenticator - TOTP","factorKey":"ChallengeOMATOTP","factorAttributeName":"omatotpsecretkey","factorIsPreferred":true,"factorIsEnabled":true,"factorIsValidated":true,"factorValue":"LB************Y4","factorAlias":"Bitwarden","factorImageURL":"js/libs/imcs/images/phone.png","factorKeyLabel":"Key"}'
  index="0"
  class="oj-complete">

  <div class="oj-panel oj-panel-shadow-lg oj-sm-padding-2x oj-sm-margin-6x-top">
    <div class="oj-flex oj-sm-flex-items-1 oj-sm-align-items-center">
      <!-- Preferred factor icon (alt changes to include "preferred") -->
      <img src="js/libs/imcs/images/Oval.png" alt="Mobile Authenticator - TOTP preferred">
      <div class="factor-panel-wrap oj-flex-item">
        <span>Mobile Authenticator - TOTP</span>
      </div>
      <oj-menu-button class="oj-button-sm ..." title="Menu Button">
        <button class="oj-button-button" aria-haspopup="true">...</button>
        <oj-menu slot="menu">
          <!-- "Set As Default" absent or hidden when already default -->
          <oj-option id="removeDefault0" value="removeDefault">Remove Default</oj-option>
          <oj-option id="disable0"       value="disable">Disable</oj-option>
          <oj-option id="delete0"        value="delete">Delete</oj-option>
        </oj-menu>
      </oj-menu-button>
    </div>

    <div class="oj-flex oj-flex-item oj-sm-7">
      <span>Bitwarden</span>  <!-- factorAlias -->
      <!-- "Default" badge present only on preferred factor -->
      <span class="oj-flex-item oj-sm-padding-1x-horizontal">Default</span>
    </div>
    <span>LB************Y4</span>
    <span>Enabled</span>
  </div>
</factor-panel>
```

## Account factor count observations

Observed state during mapping session: account had **4 factors** (Bitwarden, e, qqqq, w). After enrolling `claude-map-1`, the list showed **5 factors**. The "Add Authentication Factor" button was still present and visible at 5 factors — the five-factor limit behavior was NOT triggered. This suggests the limit may be higher than 5, or the button hides only at 6+. **Not confirmed.**

## Gotchas

- **Same page as factors-list**: No URL change, no full reload. The SPA re-renders the panel list in-place. Poll for the new `factor-panel` element whose `factorAlias` matches the newly enrolled name.
- **index attribute shifts**: The `index` attribute on each `factor-panel` reflects DOM order, not a stable ID. A newly enrolled factor may appear at any position. Always identify panels by `factorAlias` from the `factor` JSON attribute.
- **Default badge image src changes**: The preferred panel uses `Oval.png` instead of `phone.png`. Both panels are type "Mobile Authenticator - TOTP" — distinguish by image src or `alt` attribute.
- **`Set As Default` option hidden via `display:none` in static DOM**: Interact via accessibility tree snapshot UIDs after the menu is opened, not by direct `getElementById('default{N}').click()`.
