# Page: oaa-spa-home

## Detection

- **URL pattern**: pathname is `/oaa/rui/index.html` with `?h_ra=1` — **same URL as factors-list, totp-enroll-secret, and totp-enroll-verify**
- **DOM marker**: `document.getElementById('categoryActionheader') !== null`
- **Heading text**: "Hi, what are you managing today?"
- **Page title**: `""` (empty before OAuth consent; `"CUNY Login Advanced Authentication"` after)

This is the SPA landing view. It is the first view rendered when navigating to `/oaa/rui/index.html?h_ra=1`. The `factor-panel` elements documented in `factors-list.md` are **not present** here; they only appear after clicking the "Manage" button for "My Authentication Factors".

**Entry**: Reached immediately after the allow-gate redirects to `/oaa/rui/index.html?h_ra=1`. The SPA renders the home view first. Clicking the "Manage" button for "My Authentication Factors" transitions to the `factors-list` view (same URL).

## Authentication state: two modes

| Header content | What it means |
|---|---|
| `button "Application Navigation"` only (no user email shown) | Partial session — SPA shell loaded but OAuth token not yet issued. Factor API calls return 401. |
| `button "ALEXANDER.MARTY98@login.cuny.edu"` visible | Full OAuth session — factor data API calls succeed. |

The home view shell renders in both modes. Factor data only loads after going through credential-entry → TOTP → allow-gate (Allow).

## Key elements

| Purpose | Selector method | Selector value | Element type | Notes |
|---------|----------------|----------------|--------------|-------|
| Home view marker | `getElementById` | `categoryActionheader` | `<span id="categoryActionheader">` | Text: "Hi, what are you managing today?" |
| Manage Auth Factors button | `getElementById` | `createNewCategory` | `<oj-button id="createNewCategory">` | Inner clickable: `button.oj-button-button` inside it |
| Manage Devices button | `getElementById` | `manageDevices` | `<oj-button id="manageDevices">` | Inner clickable: `button.oj-button-button` inside it |
| Auth Factors section heading | text | `"My Authentication Factors"` | `<div>` (KO-bound text) | Inside the Authentication Factors panel |

## Timing

- **Oracle JET SPA** — but the home view renders fast: `domComplete` observed at **~300ms** after navigation.
- `#categoryActionheader` and `#createNewCategory` are present synchronously at `domComplete`. No MutationObserver needed for the home view itself.
- The slow 20–25 second wait documented in `factors-list.md` begins **after clicking Manage** — that is when `factor-panel` elements start loading, not on the home view itself.

## Transitions

| Action | Leads to |
|--------|----------|
| Click "Manage" (Authentication Factors) | `factors-list` view — same URL, `factor-panel` elements appear after ~19–25s |
| Click "Manage" (Devices) | Devices management view (not mapped) |

## Gotchas

- **Same URL as all other SPA views**: Detect by `#categoryActionheader` presence, not URL.
- **`#createNewCategory` is the stable ID for the Auth Factors Manage button**: Despite the confusing name, this is the correct ID. The Devices button uses `#manageDevices`.
- **Direct navigation without OAuth token shows empty factor list**: If you navigate directly to `/oaa/rui/index.html?h_ra=1` without completing the login→TOTP→allow-gate flow, the home view renders but clicking Manage leads to a factors-list header with no `factor-panel` elements (factor API calls return 401).
- **Clicking `oj-button#createNewCategory` outer element vs inner button**: Click the inner `button.oj-button-button` for reliability: `document.querySelector('oj-button#createNewCategory button.oj-button-button')?.click()`.

## HTML skeleton

```html
<!-- Oracle Universal Authenticator SPA — home view -->
<!-- Detect by: document.getElementById('categoryActionheader') !== null -->
<!-- URL: /oaa/rui/index.html?h_ra=1 (same as all other SPA views) -->

<span id="categoryActionheader" class="oj-typography-body-xl oj-sm-margin-4x-horizontal oua-block-display">
  Hi, what are you managing today?
</span>

<div id="topCategories" class="oj-flex oj-sm-flex-items-1 oj-sm-margin-2x-horizontal">

  <!-- Authentication Factors panel -->
  <div class="oj-panel oj-panel-shadow-sm oj-flex-item oua-panel" style="padding: 0;">
    <div class="oj-sm-margin-2x-bottom wg-panel oj-flex oj-sm-flex-direction-column oj-sm-justify-content-center">
      <img src="css/images/kba/AnswerLogic.jpg" alt="Manage Authentication Factors">
      <div class="oua-card-primary-text oj-sm-padding-2x-vertical oj-sm-padding-4x-horizontal">
        My Authentication Factors
      </div>
      <div class="oj-flex-item oua-card__footer">
        <div class="oj-sm-padding-4x">
          <oj-button id="createNewCategory" chroming="outlined" style="width: 100%;">
            <button aria-labelledby="createNewCategory_oj9|text" class="oj-button-button">
              <div class="oj-button-label">
                <span id="createNewCategory_oj9|text" class="oj-button-text">Manage</span>
              </div>
            </button>
          </oj-button>
        </div>
      </div>
    </div>
  </div>

  <!-- Devices panel -->
  <div class="oj-panel oj-panel-shadow-sm oj-flex-item oua-panel" style="padding: 0;">
    <div class="oj-sm-margin-2x-bottom wg-panel oj-flex oj-sm-flex-direction-column oj-sm-justify-content-center">
      <img src="css/images/kba/Networking.png" alt="Manage Devices">
      <div class="oua-card-primary-text oj-sm-padding-2x-vertical oj-sm-padding-4x-horizontal">
        My Devices
      </div>
      <div class="oj-flex-item oua-card__footer">
        <div class="oj-sm-padding-4x">
          <oj-button id="manageDevices" chroming="outlined" style="width: 100%;">
            <button aria-labelledby="manageDevices_oj10|text" class="oj-button-button">
              <div class="oj-button-label">
                <span id="manageDevices_oj10|text" class="oj-button-text">Manage</span>
              </div>
            </button>
          </oj-button>
        </div>
      </div>
    </div>
  </div>

</div>
```
