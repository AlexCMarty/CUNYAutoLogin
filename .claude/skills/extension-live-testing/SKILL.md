---
name: extension-live-testing
description: >-
  Operates the built CUNYAutoLogin Chrome extension via MCP (chrome-extension-tester): verify a behavioral claim,
  explore UI flows, spot-check layouts with screenshots, hunt edge cases, or gather evidence for .map/ updates.
  Uses real CUNY pages and credentials — not fixtures. Use when the user asks to test, verify, explore, reproduce,
  spot-check, screenshot, or validate live extension behavior after unit/E2E tests or alongside docs.
disable-model-invocation: false
---

# Extension live testing (CUNYAutoLogin)

## When this applies

Use this skill whenever work needs the **real unpacked extension** and browser automation — not mocked pages or unit/E2E fixtures alone. Typical asks:

- **Verify** — confirm or refute one concrete claim (e.g. “invalid email does not leave EMAIL_ENTRY”).
- **Test** — exercise a flow or regression area with a short checklist.
- **Explore** — map screens, copy, selectors; capture screenshots for docs; probe edge cases (five-factor limit, Verify Later, etc.).

You may write application code **only** when the user explicitly asks (this skill defaults to observation).

Do **not** run the full unit/E2E suites as a substitute for live checks unless the user asks; this skill is for MCP-driven manual verification.

---

## Required input: credentials

**Before any step that touches real CUNY authentication**, you must have valid credentials:

- Email ending in `@login.cuny.edu`
- Password
- Base32 TOTP secret

**If the user did not supply a credentials file path or the values:** stop and ask once for a path (convention: `env/cred.txt`) or the three values. **Do not proceed** with live login until you have them.

File format:

```text
email: <email>
password: <password>
secret: <base32 totp secret>
```

Parse at the start of the session; never hardcode credentials.

### Generating a TOTP code

Generate and use in the same turn — the 30-second window expires quickly:

```bash
python3 -c "
import hmac, hashlib, base64, time, struct
secret = '<SECRET_FROM_CRED_FILE>'
key = base64.b32decode(secret + '=' * ((8 - len(secret) % 8) % 8))
t = int(time.time()) // 30
msg = struct.pack('>Q', t)
h = hmac.new(key, msg, hashlib.sha1).digest()
o = h[-1] & 0xf
code = (struct.unpack('>I', h[o:o+4])[0] & 0x7fffffff) % 1000000
print(f'{code:06d}')
"
```

---

## Safety constraint (account)

**Do not delete** the 2FA factor named **"Bitwarden"**. You may remove other factors (e.g. ones named "CUNYAutoLogin.") when cleaning up test enrollment. See repo memories under `.agents/memory/` for restoring Bitwarden as the remembered default after runs that change factor preference.

---

## MCP tools

Discover the exact tool names and arguments from the workspace MCP descriptors (e.g. `mcps/project-0-CUNYAutoLogin-chrome-extension-tester/tools/*.json`), then call them via your environment’s MCP mechanism.

Logical tools you will need:

- `load_extension`, `open_options_page`, `inspect_dom`, `simulate_tab_events`, `get_service_worker_logs`, `take_screenshot`

Fetch schemas before first use.

---

## Setup order

### 1. Build (dev)

Always build in dev mode so the debug panel is present:

```bash
npm run build:dev
```

### 2. Load extension

Use `load_extension` with `extension_path` pointing at this repo’s unpacked build, e.g. `/home/alexander/CUNYAutoLogin/dist` (adjust if workspace path differs). Call again to reload for a clean state.

### 3. Open the sidebar

This extension has **no** `popup.html`. Always:

- `open_options_page` with `page: "sidebar.html"` and `action: "open"`

Never rely on popup interaction helpers — they fail with missing popup.

### Visual QA (dev build only)

For **layout and styling**, jump straight to a mounted onboarding screen with a URL hash instead of walking the flow. Requires `npm run build:dev` (**development** or **e2e** Vite mode); production bundles ignore `#qa=` and fall through to normal boot.

**CLI screenshots (no MCP, no CUNY):** When the task is only sidebar appearance, prefer `npm run build:e2e` then `npm run capture-sidebar -- '#qa=EXT_PASSWORD_SETUP'` (or any other hash). [`scripts/capture-sidebar.mjs`](../../../scripts/capture-sidebar.mjs) loads the unpacked `dist/` extension in Chromium, opens `sidebar.html` with the hash, uses a **380×800** viewport by default (side-panel shape; override with `--width` / `--height`), saves a PNG (default `agent_screenshots/`), and prints the absolute path on stdout — see **Sidebar screenshots (CLI)** in `CONTRIBUTING.md`. Use MCP `take_screenshot` only when you need live tabs, runtime interaction, or claims that depend on real SSO.

Open the sidebar with a hash (MCP callers: pass URL `chrome-extension://<id>/sidebar.html#qa=…`; hash changes reload the sidebar in dev per `sidebar.ts`).

| Param | Purpose |
| --- | --- |
| `qa` | **Required** for a jump. Value = onboarding screen id (same as `[data-onboarding-screen]`): any state that has a real mount (`src/onboarding/screenMounts.ts`). **Not** supported: `CREDENTIAL_ERROR` (no mounted screen — use `qa=PASSWORD_ENTRY` / `qa=EMAIL_ENTRY` with `qaCred` instead). |
| `qaEmail` | Optional seed for onboarding email fields (defaults to `visual-qa@login.cuny.edu`). URL-encoded if needed. |
| `qaPassword` | Optional seed for password drafts (defaults to a harmless dev placeholder). |
| `qaCred` | Optional `email` or `password` — sets inline credential-error UI on login screens. |

Examples:

```
sidebar.html#qa=EXT_PASSWORD_SETUP
sidebar.html#qa=CUNY_TOTP
sidebar.html#qa=PASSWORD_ENTRY&qaCred=password
```

Effects when `#qa=` is valid: session resume snapshot is cleared first; onboarding mounts with the requested screen; resume UI is suppressed; optional yellow **Dev QA jump: …** banner (`[data-dev-qa-jump-banner='true']`) appears above the bead header.

**Caveats:**

- **`OPENING_CUNY`** still runs logout + credential staging + `tabs.create`; pair with **`#cuny=<encoded benign or fixture URL>`** (existing dev escape hatch in `openingCuny.ts`) if you must avoid hitting live SSO during layout passes.
- **Guided screens** (e.g. **ALLOW_GATE**) may still post overlay messages — fine for sidebar CSS; may no-op without a matching CUNY tab.
- **BIOMETRIC_PREP** depends on WebAuthn / automation support (same environment caveat as biometrics elsewhere in this skill).

---

## Interaction rules

**Use `inspect_dom` with a JS script** for in-flow UI actions. Using `open_options_page` with `action: "click"` or `action: "type"` reloads the page and resets state. Only `inspect_dom` runs in the current document without that reload.

### Example: click by label

```js
inspect_dom({
  script: `
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Continue');
    btn?.click();
    btn?.textContent?.trim()
  `
})
```

### Example: sidebar email input

```js
inspect_dom({
  script: `
    const input = document.querySelector('[data-onboarding-email-input]');
    input.focus();
    input.value = 'user@login.cuny.edu';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value
  `
})
```

### Oracle JET inputs (CUNY SSO pages)

Plain `.value =` is often wrong. Prefer the native prototype setter pattern from the legacy tester playbook for simple fields; for login TOTP and enroll-verify OTP, follow **`.agents/memory/`** (keystroke simulation / correct selectors).

---

## Tab management

`inspect_dom` runs on the **active** tab. After the extension opens or switches CUNY tabs:

1. `simulate_tab_events` → list  
2. `simulate_tab_events` → switch to the intended index  
3. Then `inspect_dom`

---

## Reading state (prefer DOM over screenshots)

### Sidebar onboarding screen

```js
document.querySelector('[data-onboarding-screen]')?.dataset.onboardingScreen
```

Examples: `WELCOME`, `EMAIL_ENTRY`, `PASSWORD_ENTRY`, `OPENING_CUNY`, `ALLOW_GATE`, `OAA_SPA_HOME`, `GUIDED_MANAGE`, …

### Other sidebar helpers

```js
document.querySelector('[data-onboarding-bead][data-bead-status="active"]')?.dataset.beadStage
Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim())
document.body.innerText
```

### CUNY page markers

```js
({ url: location.href, body: document.body.innerText.substring(0, 500) })
```

- Credential page: URL contains `/sso/`; `#username`
- TOTP login challenge: `/oaa-totp-factor/`; `placeholder="Enter TOTP"`
- Allow gate: body includes consent text for MFA self-service
- OAA SPA home: body includes “Hi, what are you managing today?”
- Factors list: factor panels present

### Overlay

```js
document.body.innerText.includes('Click Manage')
```

---

## Screenshots

Default to DOM queries. Use `take_screenshot` when layout/CSS/regression is the question, the page looks blank, overlay positioning matters, or DOM and behavior disagree.

Take **one** screenshot per ambiguous state; read it immediately; avoid redundant captures.

---

## Credential failures

Wrong password or bad TOTP secret is **not** something to “fix” by guessing paths or secrets. Fail fast.

Output:

**CREDENTIAL_ERROR**

- **Problem:** …
- **What’s needed:** …
- **Reproducibility:** numbered steps to the failure

---

## TOTP: two different situations

1. **Logging in during onboarding** — before a vault/secret exists in the extension, **you** generate a code from the credential file and fill the login TOTP page.
2. **Adding a 2FA factor during guided onboarding** — the extension should scrape and auto-fill the enrollment code; **do not** manually generate there unless investigating a regression.

---

## Onboarding flow reference (live navigation)

Use this to reach the screen under investigation. Skip ahead only when the user’s task allows partial flows; otherwise walk forward in order.

1. **Load extension + open `sidebar.html`.**
2. **WELCOME** — assert “Let’s go”; click it.
3. **EMAIL_ENTRY** — fill `[data-onboarding-email-input]`, dispatch `input`, click Continue.
4. **PASSWORD_ENTRY** — fill `input[type=password]`, dispatch `input`, click Continue (forward control may carry `data-onboarding-password-forward="true"`).
5. **OPENING_CUNY** — extension opens CUNY tab; credential page autofills; tab typically lands on **login TOTP** (`/oaa-totp-factor/`).
6. **CUNY login TOTP** — switch to CUNY tab; fresh TOTP; fill per memory selectors (not generic `querySelector('input')`); Verify.
7. **Allow gate** — consent UI; sidebar should move to **ALLOW_GATE**.
8. **OAA SPA home** — `/oaa/rui/...`; sidebar **OAA_SPA_HOME**; guided copy references “Manage” under My Authentication Factors.

**Guided secret capture (Manage → Add factor → TOTP):**

9. Overlay highlights Manage; user/clicks **Manage** → `?view=factors`.
10. **GUIDED_MANAGE / GUIDED_FACTOR_TYPE** — Add Authentication Factor → choose TOTP option; watch five-factor limit edge case (disabled option, sidebar `data-onboarding-five-factor-limit`).
11. **`?view=secret`** — extension names factor, captures secret; **Verify Now** (often no stable `id` — find button by text).
12. **`?view=verify`** — extension keystroke-fills OTP; user confirms **Verify and Save**. Failure modes: client-side empty OTP vs server “Incorrect code” vs pause UI in sidebar. **Verify Later** path → recovery UI, no premature advance to SET_DEFAULT.

**Post-enroll:**

13. **`?view=post-enroll`** — **SET_DEFAULT**: kebab on CUNYAutoLogin factor → **Set as Default**; polling until preferred factor flips; then **EXT_PASSWORD_SETUP**.

**Later sidebar screens:**

14. **EXT_PASSWORD_SETUP** — strength, match, forward disabled rules.
15. **BIOMETRIC_OFFER / BIOMETRIC_PREP** — optional WebAuthn PRF enrollment after extension password; platform authenticator may be unavailable in automation; note environment caveat.
16. **COMPLETE_DEMO / COMPLETE_DONE** — terminal UI; demo tab behavior per user task.

**Interruption / resume (when testing those claims):**

- CUNY tab closed mid-flow → sidebar reopen affordance.
- Sidebar navigated away and back → resume vs fresh WELCOME depending on `storage.session`.

Consult `.agents/memory/` for live-verified details (selectors, keystroke patterns, cleanup).

---

## Service worker logs

After steps involving background ↔ content messaging:

```js
get_service_worker_logs({ clear_after: true })
```

Logs may be sparse.

---

## Common pitfalls

| Issue | Mitigation |
| --- | --- |
| Popup / interact_with_popup errors | Use `sidebar.html` via `open_options_page` |
| State resets on click/type via options API | Use `inspect_dom` scripts |
| Wrong tab queried | List + switch tabs first |
| JET value doesn’t stick | Native setter / keystroke patterns per memory |
| TOTP rejected | Regenerate; window may have rolled |
| Stuck on OPENING_CUNY | Confirm CUNY tab opened |
| Onboarding screen missing in QA | Dev hash `#onboarding=1` or `#qa=<STATE>` (dev/e2e builds only) |
| Biometric enrollment | MCP or browser may block WebAuthn flows — skip if tooling cannot proceed |

---

## Security-oriented checks

When the claim touches secrets:

- No master password in `storage.local`
- TOTP secret staging only where designed (often `storage.session`, not `storage.local`)
- Onboarding credentials stay module-scope — not persisted to storage
- No credential keys in `localStorage`

Inspect via extension-context APIs where applicable.

---

## Output shape

**Verification / test:**  
**VERDICT: CONFIRMED** or **VERDICT: REFUTED** — claim — numbered steps — evidence (DOM, logs, screenshot summary) — anomalies.

**Explore / documentation:**  
Structured notes: URLs, `data-onboarding-screen` values, selectors, screenshots paths, edge cases, suggested `.map/` updates — no forced verdict unless the user asked for one.

---

## Institutional knowledge

Record durable quirks (timing, selectors, JET behavior) under **`.agents/memory/`** using the process at the end of this file. Read `MEMORY.md` there when starting a session that depends on prior live runs.

---

## Update memory (version-controlled)

Update memory as you discover behavioral patterns, edge cases, flaky interactions, and environment quirks. This builds institutional knowledge across sessions.

Examples worth recording:

- Timing (e.g. wait before listing tabs after OPENING_CUNY)
- Oracle JET inputs that need keystroke simulation vs native setter
- Transitions that need extra clicks or waits
- Service worker log patterns
- DOM queries that intermittently return null
- Build artifacts that caused false failures

### Types of memory

There are several discrete types:

**user** — Role, goals, preferences. Tailor collaboration; avoid negative judgments.

**feedback** — What to repeat or avoid; include **Why:** and **How to apply:** for edge-case judgment.

**project** — Initiative/context not obvious from code (convert relative dates to absolute when saving).

**reference** — Pointers to external systems.

### What NOT to save

- Code conventions discoverable from the repo
- Git history as memory
- Fix recipes that belong in commits
- Duplicates of `CLAUDE.md`
- Ephemeral single-session task state

### How to save memories

**Step 1** — Write the memory to its own file under **`.agents/memory/`** (e.g. `feedback_jet_otp.md`) using:

```markdown
---
name: {{memory name}}
description: {{one-line description — specific, for relevance ranking}}
type: {{user, feedback, project, reference}}
---

{{content — for feedback/project: rule/fact, then **Why:** and **How to apply:**}}
```

**Step 2** — Add one index line to **`.agents/memory/MEMORY.md`**: `- [Title](file.md) — short hook` (no frontmatter on `MEMORY.md`; keep under ~200 lines total; each line ~150 chars).

- Organize by topic; update or remove stale entries; dedupe.

### When to read memory

- When prior live runs likely matter, or the user says to check memory.
- If the user says to **ignore** memory: do not apply or cite it.
- Memories can go stale — verify against current code/DOM before acting; update or delete contradictions.

### Before recommending from memory

If a memory names a file, function, or flag, confirm it still exists (`Read` / `grep`) before telling the user to rely on it.

### Memory vs other persistence

- Use **tasks** (or your session checklist) for steps inside the current conversation.
- Use **memory** for facts useful in **future** conversations.

Your memory index path: **`.agents/memory/MEMORY.md`**.
