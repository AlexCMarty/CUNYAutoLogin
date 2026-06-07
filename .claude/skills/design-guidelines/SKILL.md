---
name: design-guidelines
description: Design system reference for CUNYAutoLogin's browser-extension sidebar. Use whenever adding, editing, or reviewing any UI in the sidebar or onboarding flow — new screens, new components, visual changes, copy tweaks, HTML/CSS generation. Covers the token layer, every component pattern, button variants, form elements, status banners, card types, bead header, and the vault UI. Invoke proactively even when the task is "just" writing HTML or CSS for this extension.
disable-model-invocation: false
---

# CUNYAutoLogin Sidebar — Design Guidelines

Single stylesheet: `src/sidebar/sidebar.css`. Markup lives in `sidebar.html` (vault — static) and `src/onboarding/screens/*.ts` (onboarding — built in JS). All new components must use the token layer below — never hardcode hex values, font names, or pixel sizes that have a token equivalent.

> **Exact metrics live in the CSS, not here.** This guide maps each class to its *purpose*, the *tokens* it uses, and the *rules* you can't infer from reading the stylesheet. For precise sizes, paddings, and durations, open the class in `sidebar.css` — restating them here would only drift the moment someone tweaks a value. The token tables below are the deliberate exception: they're the source-of-truth definitions and change rarely.

---

## Design tokens (`src/sidebar/sidebar.css` `:root`)

### Colors

| Token | Value | Use |
|---|---|---|
| `--clr-bg` | `#f6f3ec` | Page / shell background |
| `--clr-surface` | `#ffffff` | Cards, inputs — raised surface |
| `--clr-border` | `#e3ddcd` | Dividers, card borders |
| `--clr-border-input` | `#cfc8b5` | Input borders, secondary button borders |
| `--clr-text` | `#15140f` | Primary text, strong labels |
| `--clr-text-secondary` | `#54514a` | Body copy, hints, secondary labels |
| `--clr-text-muted` | `#9a9587` | Placeholders, metadata, pill text |
| `--clr-accent` | `oklch(0.55 0.12 35)` | Primary action, focus ring, active bead |
| `--clr-accent-dark` | `oklch(0.45 0.12 35)` | Hover state of accent buttons |
| `--clr-error` | `oklch(0.45 0.13 25)` | Inline error text |
| `--clr-error-bg` | `#f8ece8` | Error banner background |
| `--clr-error-border` | `oklch(0.45 0.13 25 / 0.2)` | Error banner border |
| `--clr-hint-bg` | `#efeadd` | Reassurance callout, key display background |
| `--clr-ok-bg` | `#ecf2e4` | Success banner background |
| `--clr-ok-ink` | `oklch(0.45 0.08 145)` | Success text / icon |
| `--clr-warn-bg` | `#f4ecd9` | Warning banner background |
| `--clr-warn-ink` | `oklch(0.5 0.1 75)` | Warning text |

### Typography

All three font roles resolve to the same stack:
```
'Geist', 'Helvetica Neue', Helvetica, Arial, sans-serif
```
`--font-mono` → `'Geist Mono', ui-monospace, monospace`

Use the semantic variables (`--font-ui`, `--font-heading`, `--font-body`) in new CSS even though the stacks are identical — they signal intent and allow future divergence.

### Spacing & radius

| Token | Value |
|---|---|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--radius` | 8px |
| `--radius-sm` | 5px |

Screen horizontal padding uses `clamp(12px, 4vw, 18px)` so content doesn't clip at 240 px (Firefox's default sidebar width). Headings use `clamp(18px, 6vw, 22px)` for the same reason. Treat these clamps as the standard responsive recipe — reuse them rather than inventing new ones.

---

## Buttons

### Primary — `.primary` / `.onboarding-cta` / `.onboarding-forward` / `.onboarding-btn-primary`

Full-width, accent-fill button. Use for the single forward action on a screen.

```html
<button type="button" class="onboarding-cta primary">Let's set it up</button>
```

- Background `var(--clr-accent)` → hover `var(--clr-accent-dark)`; weight 600.
- Disabled: dimmed + `cursor: not-allowed`.

### Secondary — `.secondary` / `.onboarding-back` / `.onboarding-btn-secondary`

Full-width, ghost button. Use for back navigation or lower-priority actions.

```html
<button type="button" class="onboarding-back secondary">Back</button>
```

Transparent → hover `var(--clr-border)` fill; border `var(--clr-border-input)` → hover `var(--clr-text-muted)`.

### Link-style — `.onboarding-btn-link`

Text-only, underlined button for tertiary or skip-style actions. `var(--clr-text-secondary)` → hover `var(--clr-text)`.

### Back / CTA flex pattern

Pair back + CTA inside `.onboarding-actions`:

```html
<div class="onboarding-actions">
  <button class="onboarding-back secondary">Back</button>
  <button class="onboarding-cta primary">Continue</button>
</div>
```

Back gets `flex: 1`, CTA gets `flex: 2` — the CTA reads as the dominant action.

---

## Form elements

### Text input — `.onboarding-input` / `.vault-input`

Standard text field. On focus it shows the accent outline + border (see Focus & accessibility).

```html
<input class="onboarding-input" type="text" />
```

### Password input with visibility toggle

Wrap the input in `.onboarding-input-wrap` / `.vault-input-wrap`, then append a `.toggle-visibility` button. The eye icon is a CSS mask — **no SVG in the HTML**.

```html
<div class="onboarding-input-wrap">
  <input class="onboarding-input" type="password" />
  <button type="button" class="toggle-visibility" aria-label="Show password"></button>
</div>
```

The JS adds `.is-showing` to `.toggle-visibility` to swap closed ↔ open eye. See `sidebar.css` → `.toggle-visibility` for the mask details.

### Monospace key input — `.onboarding-input--key`

Add this modifier class for TOTP-secret / passkey paste fields — renders Geist Mono, uppercase, tracked-out.

```html
<input class="onboarding-input onboarding-input--key" type="text" autocomplete="off" />
```

### Field OK line — `.onboarding-field-ok`

Green confirmation below a valid input — prepends `✓` via `::before`, color `var(--clr-ok-ink)`. Inserted via JS.

```html
<p class="onboarding-field-ok">Valid 32-character key</p>
```

### Labels

`.onboarding-label-text` / `.vault-field-label`: weight 600, `var(--clr-text)`.

---

## Status banners

All banners sit inside the screen's flex column as block paragraphs. Prefer `<p>` over `<div>` when it's a line of text.

| Class | When to use |
|---|---|
| `.onboarding-inline-hint` | Neutral guidance; warm `var(--clr-hint-bg)` bg |
| `.onboarding-credential-error` | Field-level validation failure (red) |
| `.onboarding-recovery-message` | Key/recovery-path warnings (amber) |
| `.onboarding-status` | Success confirmation (green) |
| `.onboarding-error` | Inline error without a box, under a field |
| `.onboarding-reassurance` | Trust-building statement; left accent border in `var(--clr-accent)` |
| `.vault-advanced-warn` | Dangerous / irreversible action inside vault (amber, with ⚠ `::before`) |

Boxed banners use `var(--radius-sm)` and the warm/red/amber/green token pairs above; keep them as `<p>` blocks in the column flow.

---

## Cards

Surface cards: `var(--clr-surface)` bg, 1px `var(--clr-border)` border, ~10px radius, flex column with a gap.

### Step card — `.onboarding-step-card`

Numbered steps with status dots. Each row is `.onboarding-step-row` containing an `.onboarding-step-num` circle and `.onboarding-step-body`. Number state via `data-step-status`:
- `pending` → `var(--clr-bg)` bg, `var(--clr-border)` border, muted text
- `active` → `var(--clr-accent)` fill, white text
- `done` → `var(--clr-text)` fill, white text

### Demo list — `.onboarding-demo-list`

Animated walkthrough with dots. `.onboarding-demo-dot[data-active="true"]` fills accent; `[data-done="true"]` fills `var(--clr-text)`.

### Feature card — `.onboarding-feature-card`

Done-screen summary rows. `.onboarding-feature-title` (weight 600) + `.onboarding-feature-body` (secondary color).

### Choice card — `.onboarding-choice`

Fork-in-the-road card. Full-width button with title, optional pill, description, and chevron.

```html
<button class="onboarding-choice onboarding-choice--lead">
  <div class="onboarding-choice-main">
    <div class="onboarding-choice-titlerow">
      <span class="onboarding-choice-title">Set up from scratch</span>
      <span class="onboarding-pill">Recommended</span>
    </div>
    <p class="onboarding-choice-desc">Takes about five minutes.</p>
  </div>
  <span class="onboarding-choice-chevron" aria-hidden="true">›</span>
</button>
```

`.onboarding-choice--lead` adds an accent border and a warm tinted background to mark the recommended path. Hover shifts the chevron right and turns it accent.

---

## Pills, dividers, accordions

### Pill — `.onboarding-pill` / `.onboarding-pill--muted` / `.vault-totp-pill`

Uppercase, bold, pill-shaped (`border-radius: 999px`). Default: white on accent bg. Muted variant: `var(--clr-text-secondary)` on `var(--clr-hint-bg)`.

### Labelled divider — `.onboarding-divider`

```html
<div class="onboarding-divider" aria-hidden="true">or</div>
```

Flex row with `::before`/`::after` hairlines in `var(--clr-border)`; uppercase, muted label.

### Accordion — `.onboarding-accordion`

Uses native `<details>/<summary>`. The `.onboarding-accordion-chevron` rotates 180° when `[open]`.

---

## Onboarding structure

### Bead progress header — `.onboarding-bead-header`

Sticky top bar with 5 beads. Each `<li>` is `.onboarding-bead` with `data-bead-status="pending|active|completed"`.

- Connector line between beads is an `::before` pseudo on `li + li`, positioned with `left: -50%; right: 50%`. Completed beads turn the connector accent.
- `.onboarding-bead-dot` — active → accent fill; completed → `var(--clr-text)` fill with `✓`.
- `.onboarding-bead-label` — muted, `word-break: break-word`, `hyphens: auto`: it must wrap rather than widen the row.
- **`min-width: 0` on `.onboarding-bead` is required** — without it the flex items won't shrink below their label's intrinsic width and the row overflows at 240 px.

### Screen shell — `.onboarding-screen`

```html
<section class="onboarding-screen onboarding-screen-welcome" data-onboarding-screen="WELCOME">
  …content…
  <div class="onboarding-actions">…buttons…</div>
</section>
```

Same padding/gap recipe as `.vault-wrap`. The `.onboarding-actions` block uses `margin-top: auto` to pin buttons to the bottom. Screen-specific modifier classes (e.g. `.onboarding-screen-welcome`) live on the `<section>`; the welcome screen bumps its headline one size larger.

### Typography classes

| Class | Role | Color |
|---|---|---|
| `.onboarding-headline` | Screen title — fluid `clamp`, weight 600 | `var(--clr-text)` |
| `.onboarding-body` | Default body copy | `var(--clr-text-secondary)` |
| `.onboarding-sub` / `.onboarding-subtext` | Small secondary copy | `var(--clr-text-secondary)` |
| `.onboarding-authorship` | Smallest, centered footnote | `var(--clr-text-muted)` |

`.onboarding-body` uses `overflow-wrap: anywhere` to break long unbreakable tokens (emails, TOTP keys) instead of widening the panel.

### Waiting / pulse indicator

```html
<div class="onboarding-pulse-wrap">
  <div class="onboarding-pulse"></div>
</div>
<p class="onboarding-waiting-label">Waiting for CUNY…</p>
```

Accent circle with animated concentric rings (`pulse-ring` keyframe) + an italic secondary label.

### Tab-hint card — `.onboarding-directional`

```html
<div class="onboarding-directional">Switch to the CUNY tab to complete this step.</div>
```

White surface card with a `↗` glyph via `::before`.

### Progress bar — `.onboarding-step-progress`

```html
<div class="onboarding-step-progress">
  <div class="onboarding-step-progress-bar">
    <div class="onboarding-step-progress-fill" style="width: 60%"></div>
  </div>
</div>
```

Thin accent fill that transitions on `width` (set inline).

### Password strength meter

```html
<div class="onboarding-ext-password-strength-wrap">
  <div class="onboarding-strength-segments">
    <div class="onboarding-strength-seg" data-active="true"></div>
    <div class="onboarding-strength-seg"></div>
    <div class="onboarding-strength-seg"></div>
  </div>
  <span class="onboarding-ext-password-strength">Weak</span>
</div>
<p class="onboarding-ext-password-match" data-match-ok="false">Passwords don't match</p>
```

Segments fill accent when `data-active="true"`. Match line: green when `data-match-ok="true"`, red when `false`.

---

## Vault UI

The post-onboarding sidebar (`.vault-wrap`), built statically in `sidebar.html` and toggled between **locked** and **unlocked** modes by `vaultController.ts`. Same tokens; different component set. Action buttons reuse the generic `.primary` / `.secondary` classes — the only vault-specific button is the secret-reveal one.

### Layout — `.vault-wrap`

Flex column, `min-height: 100vh`, same screen padding/gap recipe as onboarding screens. Footer (`.vault-footer`, version line) uses `margin-top: auto`.

### Locked-mode header — `.vault-locked-header`

Shown only in locked mode.

```html
<div class="vault-locked-header">
  <span class="vault-locked-pill">Locked</span>
  <h1 class="vault-greeting">Welcome back.</h1>
  <p class="vault-greeting-sub">Use your biometrics or type your password to fill your CUNY sign-in.</p>
</div>
```

Pill: uppercase, muted. Greeting: fluid heading (`clamp`), tight letter-spacing.

### Status line — `.vault-status-msg`

One-line status/error message below the header (`role="status"`, `aria-live="polite"`). Reserves vertical space (`min-height`) so the layout doesn't jump when it appears. Red by default; add `.ok` for the green success state.

```html
<p class="vault-status-msg ok" role="status" aria-live="polite">Saved.</p>
```

### Form hints — `.vault-mode-hint`, `.vault-hint`

Secondary-color helper paragraphs:
- `.vault-mode-hint` — context line at the top of the form (what the current mode does).
- `.vault-hint` — generic field note. `.vault-hint.totp-source-hint` annotates where the TOTP secret came from; `.vault-hint.vault-change-master-hint` introduces the change-password section with a top hairline (`border-top`).

### Fields — `.vault-field` / `.vault-input`

Each field is a `.vault-field` (`<label>` + flex column) wrapping a `.vault-field-label` and a `.vault-input` inside `.vault-input-wrap` (which hosts the `.toggle-visibility` eye button — same pattern as onboarding).

### Action buttons — `.vault-actions`

Flex-column button group at the bottom of the form. Holds the submit button (`.primary` — label is "Unlock" when locked, "Save" when managing) and the lock button (`#lock-btn.secondary`, hidden until unlocked). Biometric unlock is a separate `.primary` button (`#biometric-unlock-btn`) shown above the password field when a passkey is enrolled.

### TOTP card — `.vault-totp-card` (unlocked mode)

White surface card. Header row has a label (`.vault-totp-card-label`) and a pill (`.vault-totp-pill`); body (`.vault-totp-card-body`) describes the auto-fill behaviour.

### Advanced key reveal — `.vault-advanced` (inside the TOTP card)

Deliberate-friction disclosure: **Advanced toggle → caution banner → Show key**.

- `.vault-totp-divider` — faint hairline separating the everyday copy from the advanced affordance.
- `.vault-advanced-toggle` — uses `aria-expanded` to rotate `.vault-advanced-chevron` 180°.
- `.vault-advanced-warn` — caution banner in the warn-token language with a `⚠` `::before`.
- `.vault-reveal-btn` — the "Show secret key" button (ghost button mirroring `.secondary`); keeps the key hidden behind an explicit action.
- `.vault-secret` — the revealed block: `.vault-secret-value` (Geist Mono, dashed border, `user-select: all`; value grouped in 4s by `vaultController`) followed by `.vault-secret-actions`, a row of `.vault-secret-action` buttons (Copy / Hide). The copy-success state adds `.is-ok` (green border + text).

---

## Focus & accessibility

All interactive elements that receive keyboard focus use:

```css
&:focus-visible {
  outline: 2px solid var(--clr-accent);
  outline-offset: 1px; /* or 2-3px on cards */
  border-radius: <match element>;
}
```

Never suppress `:focus-visible`. Avoid `:focus` — use `:focus-visible` only.

---

## CSS authoring rules

- **Native nesting** — the sheet uses CSS nesting (`& .child`, `&:hover`, etc.). No Sass. No PostCSS plugins beyond Vite's defaults.
- **Tokens, not literals** — never write `#e3ddcd` or `oklch(...)` inline when a token exists.
- **One stylesheet** — all sidebar CSS goes in `sidebar.css`. Inline `style=` attributes only for dynamic values (e.g. progress bar width).
- **No hardcoded font families** — use `--font-ui`, `--font-heading`, `--font-body`, `--font-mono`.
- **Fluid sizing** — use `clamp()` for any font or padding that would clip at 240 px minimum width. Don't set `min-width` on flex children that must shrink.
- **Transition default** — use `0.15s` for color/background transitions; `0.18–0.2s ease` for transforms and border-radius.
