# UI Design Ideas

Presently the UI is a functional form with system defaults. No visual identity, no sense that this is a security tool, no celebration of what it actually does (auto-fill + live TOTP). Three directions worth considering:

---

## Direction 1 — "Vault card"

A two-zone layout: a dark header band, white form body. Each **mode gets its own identity** rather than the same form reshuffling.

**Locked mode** is intentionally stark:
```
╔══════════════════════════╗
║  🔒  CUNYAutoLogin        ║  ← dark header, 48px tall
╠══════════════════════════╣
║                          ║
║  [••••••••••••••••••]  👁 ║  ← just the one field
║                          ║
║  [ Unlock ]              ║
╚══════════════════════════╝
```
The sparseness communicates "this is a locked safe." Nothing extra to look at.

**Unlocked mode** is where it gets interesting — the TOTP code gets a *live countdown ring*:
```
╔══════════════════════════╗
║  ✓  Vault open           ║
╠══════════════════════════╣
║                          ║
║   ┌─────────────────┐    ║
║   │  482 916   ◷29s │    ║  ← SVG arc shrinks in real time
║   └─────────────────┘    ║
║                          ║
║  you@login.cuny.edu      ║
║  [ Save changes ]  [Lock]║
╚══════════════════════════╝
```
Students can glance at the live code and remaining seconds without opening a separate authenticator app.

---

## Direction 2 — "Swiss minimal"

Opposite instinct: strip everything to typography and color. No icons, no panels. The form *is* the UI.

- `font-family: ui-monospace` for inputs only — signals "this is sensitive data"
- Labels are uppercase, 10px, letter-spaced — creates a strong grid without decoration
- Status messages use a 3px left border instead of color-changing text: red border = error, blue border = info
- Buttons are full-width, flat, with a 1px border — no shadows, no gradients
- The only color in the whole UI is that left border stripe and the focus ring

The effect is something like a 1Password receipt or a terminal tool that respects you.

---

## Direction 3 — Mode-as-metaphor (favorite)

Lean hard into the **three states as three physical objects**:

**Setup** — feels like filling out a form at a desk. Warm off-white (`#fafaf8`), slightly wider, a soft shadow on the card. A progress hint at top: `Step 1 of 1 — create your vault`.

**Locked** — cold, minimal. Background shifts to a near-black (`#111318`), white text. The padlock is the only graphic element, centered above the input. There's no title bar — just the lock and the field. It communicates: *access denied until you prove yourself.*

**Unlocked** — accent color goes green (`#1a7f4b`). The header says `Vault open` in a small, confident badge. The TOTP code is the largest text on screen.

The key CSS primitive here is a `data-mode` attribute on `<body>` or `<main>` that drives everything via `:has([data-mode="locked"])` selectors — no JS class toggling needed for visual state.

---

## What to build first

The TOTP countdown display in the unlocked state is the highest ROI change. It turns an invisible background feature into something visible and reassuring.

```
SVG circle with stroke-dashoffset animated from 0→circumference over 30s,
reset on each new TOTP window.
```

Combined with showing the live 6-digit code prominently, the unlocked popup becomes genuinely useful to glance at — not just a "save your credentials" form.
