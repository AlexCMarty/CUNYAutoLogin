# Onboarding Overhaul v2

## Goals

- A CUNY student who has never set up 2FA can complete onboarding unassisted.
- No technical jargon reaches the student unless unavoidable and immediately explained.
- Trust is established on Screen 1 and reinforced throughout.
- The student sees the extension work before they're done.

---

## User profile

Non-technical CUNY college student. First time setting up an authenticator app. Mildly skeptical about entering credentials into a browser extension they just installed. Will abandon at the first moment of confusion or distrust. Has multiple CUNY-adjacent passwords and is not sure which one applies here.

---

## Copy rules (enforce everywhere)

| Never say | Say instead |
|---|---|
| TOTP | login code / verification code |
| TOTP secret / secret key | (never show to student — captured silently) |
| Master password | extension password |
| MFA / 2FA | two-factor login / login codes |
| Base32 | (never show) |
| Self-service portal | CUNY Login page |

When students go to Brightspace for their grades they are redirected to ssologin.cuny.edu. "Brightspace" here is the more familiar since it refers to the same login page.

Tone: friendly, brief, one idea per sentence. No exclamation points in body copy — save them for genuine celebration (Screen 13 only).

---

## Progress model

The student sees **5 progress beads** representing the top-level stages:

1. Your info
2. Log in to CUNY
3. Set up login codes
4. Extension password
5. Done

Beads fill in as stages complete. Individual screens within a stage do not get their own bead — they just animate through the active one. This keeps the top-level map simple even though there are ~13 internal screens.

---

## Screen 1 — Welcome

**No back button. CTA: "Let's go"**

**Headline:** CUNYAutoLogin fills in your login and generates your verification codes for you.

**Body:** Setup takes about 3 minutes.

**Reassurance line** (same visual weight as the headline — not smaller):
Your information is stored only on this device and is never sent anywhere.

### Design notes
- The reassurance line is **not** smaller text. For a user who is already skeptical about handing credentials to a browser extension, "stored only on this device" is the most important sentence on this screen — it earns the right to proceed. Reducing its size buries the trust signal under the marketing claim.
- The headline is a factual description of what the extension does, not a promise or a pitch. Promises ("never type your password again") read as bait before trust is established, and land identically to what a phishing extension would say.
- No step-by-step preview of the flow. Listing "annoying steps" upfront causes abandonment before it starts.

---

## Screen 2 — Email Entry

**No back button. Forward button grayed until input is valid.**

**Label:** What email do you use to log in to Brightspace?

**Subtext directly below label:**
This is usually firstname.lastname@login.cuny.edu. It is not your @baruchmail.cuny.edu or other school email.

**Input:** Pill-shaped. Prefilled value: `@login.cuny.edu`. Cursor placed before the `@` on focus.

**Forward button behavior:**
- Grayed until input is non-empty and ends with `@login.cuny.edu`.
- If the student types a non-`@login.cuny.edu` address and tabs/taps away, inline hint appears below the input:
  > "CUNY logins end in @login.cuny.edu — check your CUNYfirst welcome email if you're unsure."

### Design notes
- "CUNYfirst email" is dropped from the label. Students associate CUNYfirst with class registration and Brightspace with coursework — using both names without explaining they share a login introduces doubt about which account the extension needs. "What email do you use to log in to Brightspace?" is unambiguous.
- The @login.cuny.edu vs school email distinction is the single biggest source of wrong-credential failures. Address it here, not after the failure happens.

---

## Screen 3 — Password Entry

**Back button returns to Screen 2. Forward button grayed until input is non-empty.**

**Label:** What's your Brightspace password?

**Subtext directly below label:**
The password you use to log in to Brightspace.

**Reassurance line** (below the input, above the forward button):
We'll use these to log you in once, right now, so you can watch it work.

**Input:** Pill-shaped. Password type. Show/hide toggle (eye icon) on the right side of the pill.

### Design notes
- The reassurance line is new in v2. At this point the student has handed a browser extension their school email and password. Without acknowledgment, the extension immediately runs off to do something with those credentials — which feels opaque to a skeptical user. The reassurance line converts "I just gave this thing my password" into "I just gave it what it needs to show me something." It reframes handing over credentials from alarming to purposeful.
- We discover wrong passwords during auto-login (Screen 5), not here. No content validation — just non-empty.
- Show/hide toggle is not optional. Students mistype passwords in narrow inputs constantly, especially on laptops with small keyboards.

---

## Screen 4 — "Opening CUNY…" (transition)

**Back button returns to Screen 3. No forward button.**

**Headline:** Opening CUNY Login…

**Body:** We're opening your school's login page in a new tab. We'll fill in your email and password so you can see how the extension works.

**Directional line** (below body):
The action is on the new tab — this window will update automatically.

**Reassurance line:** This is the same page you'd visit normally. We're not taking you anywhere unexpected.

**Visual:** Pulsing animation. Label beneath it: "Nothing to do yet — waiting for the tab to open."

**Behavior on open:**
- Extension opens `https://ssologin.cuny.edu/oaa/rui` in a new tab.
- Content script fills email and password fields.
- Popup stays open on this screen and monitors the tab.

### Design notes
- The directional line is new in v2. Without it, the student doesn't know whether to watch the popup or the tab — both are visible. "The action is on the new tab" resolves this immediately.
- The label beneath the pulsing animation ("Nothing to do yet") is new in v2. A pulsing animation is ambiguous: it could mean "the extension is doing something" or "you're supposed to do something." Students who don't know they should switch to the tab will sit and wait. The label removes the ambiguity.

---

## Screen 4-error — Wrong Credentials

If the content script detects a login error on the CUNY page (error message element present, or page has not advanced after submit):

**Do not retry automatically.** An extension that keeps submitting wrong credentials can lock a CUNY account.

**On the CUNY tab:** Show an overlay banner at the top of the page. The banner must be **visually distinct from CUNY's own error messages** — it should read as "the extension is talking to me," not "CUNY is telling me something failed." Include the extension icon in the banner so the source is unambiguous.

Banner copy:
> "CUNYAutoLogin: your email or password didn't work. Tap here to correct them."

Tapping the banner focuses the popup and returns to Screen 3 (password entry). If the email is more likely wrong (e.g. format mismatch was just discovered), return to Screen 2 instead.

**On the popup:** Replace the pulsing animation with a red status line:
> "That didn't work — tap the banner on the CUNY tab to fix your email or password."

### Design notes
- The error must surface on the webpage because the student is not looking at the popup during auto-login. Popup-only errors are invisible here.
- Visual distinctness from CUNY's own alerts is critical. An extension-injected banner on a school-branded page can read as a phishing indicator to a skeptical student. The extension icon in the banner establishes authorship — this banner is from the extension, not from CUNY.

---

## Screen 5 — "Click Allow" gate

Auto-advances once the Allow action is detected on the CUNY page. **Back button returns to Screen 3. No forward button.**

**Headline:** Almost there — one more tap on the CUNY tab.

**Body:** CUNY is confirming it's really you before showing your account settings. Look for the prompt on the tab and click Allow.

**On the CUNY tab (overlay):**
- Page dimmed to ~50% opacity.
- "Allow" button highlighted (full opacity, soft white glow ring).
- Tooltip attached to the button — first overlay use, so include a primer line:
  > "The extension will guide you with highlights like this. Click Allow to continue."

After this first overlay use, subsequent overlays do not need the primer — the student now understands the pattern.

### Design notes
- "CUNY is asking for permission to continue" (v1) is vague to the point of anxiety. Students who've encountered phishing flows recognize unexpected permission dialogs as a red flag. The v2 body copy explains specifically what Allow does: it's CUNY confirming identity before showing account settings. This converts an alarming unknown into a recognizable step.

---

## Screens 6–9 — Guided Clicks (CUNY Self-Service)

During these screens, the **popup shows a step-specific message** — one line of context explaining why the current step matters, plus the standing instruction. No forward button. Back button is available but returns to Screen 3 with a confirmation: "Going back will restart the CUNY setup steps. Are you sure?"

**Popup message format (per step):**

- **Step 1:** "Opening your login settings. Follow the highlight on the CUNY tab."
- **Step 2:** "Adding CUNYAutoLogin as a login method. Follow the highlight on the CUNY tab."
- **Step 3:** "Choosing how your codes will be generated. Follow the highlight on the CUNY tab."
- **Step 4:** "Connecting the extension to your account. Follow the highlight on the CUNY tab."

A **step counter chip** sits in the bottom-right corner of the overlay on the CUNY tab throughout these steps:
`Step 1 of 4`, `Step 2 of 4`, etc.

### Design notes
- v1 used a single static message for all four steps: "Follow the highlights on the CUNY tab. We'll move forward automatically after each step." This gave the student no sense of what they were doing or why. The guided-click section is the highest dropout risk in the flow — the student is navigating a government-style website they've never visited before, clicking through menus an extension is pointing at, with no understanding of the purpose.
- Per-step context lines are short enough to read in a glance and give the student enough agency to feel like a participant rather than an obedient cursor.

---

### Screen 6 (overlay step 1 of 4) — Manage

Highlight the **Manage** button under the "My authentication factors" heading.

Tooltip: "Click Manage to see your login methods."

---

### Screen 7 (overlay step 2 of 4) — Add authentication factor

Highlight the **Add authentication factor** button or option.

Tooltip: "Click here to add a new login method."

---

### Screen 7-edge — Five existing factors

If the extension detects the page shows 5 existing factors (the maximum), **pause the overlay** and surface a popup message:

> You've reached CUNY's limit of 5 login methods. To add CUNYAutoLogin, you'll need to remove one. Look for an old or unused method in the list — click the three dots and select "delete" — then come back to this step.

Do not automate or suggest which factor to delete. Deleting an active factor can lock the student out of CUNY. This is a decision only they can make.

Do not link to a help article. If they truly have 5 2FA they can figure it out.

---

### Screen 8 (overlay step 3 of 4) — Mobile Authenticator

Highlight the **Mobile Authenticator** option (the TOTP option).

Tooltip: "Select this to connect CUNYAutoLogin as your verification app."

**Popup message** (in addition to the standing step 3 line):
> "On the next step, we'll automatically save the key that generates your codes — you won't need to do anything."

Do not use the word "TOTP" in the tooltip or anywhere student-facing.

### Design notes
- The advance notice on Screen 8 is new in v2. On Screen 9, the extension silently captures something from the CUNY page. Even with good intentions, "we captured something from that page without you seeing it" can feel intrusive the first time a user notices it. Priming the student one step earlier converts the Screen 9 confirmation from an announcement of something that happened behind their back into a confirmation of something they were told to expect.

---

### Screen 9 (overlay step 4 of 4) — Secret key page

When the secret key page loads, the extension silently captures the secret from the page. **The student never sees the raw key.** The popup status indicator updates:

> ✓ Your login code key was saved.

On the CUNY tab:
- Extension autofills the **Friendly Name** field with "CUNYAutoLogin".
- Tooltip on the field: "We've filled in a name for you."
- Highlight the **Verify Now** button.
- Tooltip: "Click Verify Now to confirm."

---

## Screen 10 — Verify Login Code (overlay)

Extension autofills the 6-digit verification code into the code field.

Highlight the **Verify and Save** button.
Tooltip: "Click Verify and Save to finish."

**On first error** (wrong code, expired code, or CUNY shows an inline validation message):
- Show overlay message below the button: "That code expired — we've entered a fresh one. Click Verify and Save again."
- Extension regenerates the code and autofills once automatically.

**On second failure:**
- Overlay pauses. Popup shows:
  > "That code didn't work. Wait a moment for it to refresh, then click Verify and Save once more."
- If the second failure persists, add: "This can happen if your device clock is slightly off — try restarting your browser and running setup again."
- Do not loop. After two failures, stop retrying and wait for the student to act.

**On success** (extension detects return to "My Authentication Factors" page, OR assumes success on button click):
- Popup auto-advances to Screen 10a.
- Overlay dismisses cleanly.

Detect return to the factors page by checking for "CUNYAutoLogin" in the factor list.

### Design notes
- The clock explanation is moved to the second failure in v2. On first failure, it's noise — the student doesn't know what their device clock has to do with a 6-digit code, and it introduces "something is wrong with my device" anxiety. The actionable message ("wait a moment, try again") is sufficient for first failure. The clock explanation is only surfaced on a persistent second failure, where the student needs something actionable beyond "try again."

---

## Screen 10a — Set as Default (overlay)

**Immediately follows Screen 10 success** — the student is back on the "My Authentication Factors" page. No back button. No forward button.

CUNY uses whatever factor is marked "default" at next login. The newly added factor is not default automatically. If the student skips this step, their old authenticator app will be used and the extension will appear to not work.

**Two-click guided interaction:**

**Click 1 — Three-dot menu:**
- Highlight the three-dot (kebab) menu icon on the CUNYAutoLogin row.
- Tooltip: "Click the three dots next to CUNYAutoLogin."
- Popup message: "One last tap — make CUNYAutoLogin your default login method."

**Click 2 — Set as default:**
- After the menu opens, highlight the "Set as default" option.
- Tooltip: "Click Set as default."
- No additional popup message needed — the student is mid-gesture.

**Success detection:**
- Extension detects that CUNYAutoLogin is now marked as default on the "My Authentication Factors" page (e.g., a "default" badge or label appears on the CUNYAutoLogin row).
- On success, popup auto-advances to Screen 11. Overlay dismisses cleanly.

Do not auto-advance on the menu click alone — wait for the default badge to appear before advancing. A student who opens the menu and clicks something else should not trigger a false advance.

### Design notes
- This step is not optional. An extension that correctly fills credentials and generates codes will still appear broken if the old factor remains default — CUNY will challenge with the old app, not with the extension's code. Skipping this step causes a silent failure at the next real login, which is far harder to debug than a clear prompt during setup.
- The two-click structure (three dots → Set as default) is represented as one screen rather than two. Both clicks happen in rapid succession on the same page; splitting them into separate screens would overweight a trivial interaction. The overlay handles the sequencing.
- Do not use the word "default" in the popup message — it's jargon without context. "Make CUNYAutoLogin your default login method" is acceptable because "default" is immediately explained by what follows in the sentence.

---

## Screen 11 — Extension Password Setup

**Back button not available here** — credentials and secret are already staged. Returning would require clearing everything and starting over. If a student needs to go back, they can clear the extension from the browser.

**Headline:** Create your extension password

**Body:** This is separate from your CUNY password. It locks what we just saved on your device — you'll need it when you open a new browser session.

**Subtext at bottom:** If you forget this password, just run setup again — it takes about 3 minutes.

**Two inputs:**
- "Choose a password" — pill-shaped, password type, show/hide toggle.
- "Confirm password" — pill-shaped, password type, show/hide toggle.

**Inline validation:**
- Strength indicator below first input: Weak / Fair / Strong (red / yellow / green). Minimum accepted: Fair.
- Second input shows green checkmark when both match, red X while they don't match.

**Forward button:** Grayed until both fields match and strength is at least Fair.

### Design notes
- "Master password" is renamed "extension password" throughout. "Master" implies control over multiple services, which raises questions and anxiety. "Extension password" is scoped and self-explanatory.
- The recovery framing is changed in v2. "If you forget this password, you'll need to set up the extension again" (v1) is vague about consequences — a student reading it wonders if "set up the extension again" means losing their CUNY account, reinstalling, or something worse. "Just run setup again — it takes about 3 minutes" tells them exactly what happens and that it's fine. Students under pressure will pick passwords they can remember if they know the stakes are recoverable.
- Minimum strength "Fair" rather than "Strong" reduces abandonment while still ruling out "1234".

---

## Screen 12 — Biometrics (conditional)

**Only show this screen if the browser reports a platform authenticator is available.** If not available, skip directly to Screen 13.

**Headline:** Unlock faster with Face ID or fingerprint

**Body:** Instead of typing your extension password each time, use your device's built-in fingerprint or face scanner.

**Two equal-weight buttons** (same visual size and color — neither is "primary"):
- "Use Face ID / Fingerprint"
- "Type my password each time"

### Design notes
- "Use my password instead" (v1) frames the second option as a fallback. "Type my password each time" (v2) describes a deliberate choice and communicates what it means in practice. A student on a shared computer, library computer, or older device should not feel like they are choosing the worse option — the language should match the visual parity of the buttons.

---

### Screen 12a — Biometric preparation (shown before triggering system dialog)

**Only shown after tapping "Use Face ID / Fingerprint".**

**Body:** Your browser is about to ask for permission to use your fingerprint or face. This is handled by your device — not by us.

CTA: "Continue"

Then trigger the WebAuthn / platform authenticator prompt.

**On failure or denial:**
Provide option to try again. Sometimes fingerprint or face doesn't work the first time.
After the first error, show an option to continue instead with extension password. Show brief confirmation on the popup:
> "No problem — you'll use your extension password to unlock."

### Design notes
- The preparation screen exists purely to eliminate the jarring context switch when a native OS dialog appears mid-flow. Priming the student for it converts "alarming" into "expected."

---

## Screen 13 — "You're all set!" + Live Demo

**Headline:** You're all set!

**Body:** Next time you open Brightspace, this is what happens — no password needed.

**CTA button:** "Show me"

Tapping "Show me" opens `https://ssologin.cuny.edu` in a new tab and triggers AUTO_FILL_REQUEST. The student watches their email and password fill in automatically. This is the payoff moment.

After the fill is detected (or after 10 seconds with no tab activity, as a fallback), popup updates:
> That's it. Enjoy never logging in manually again.

**Secondary link** (small, below the button): "Skip" — for students who don't want the demo.

### Design notes
- "Try it now" (v1) framed the demo as a test, implying setup might not have worked. The student also just went through an entire login flow as part of setup — being asked to "try it" again raises the question of whether anything was saved.
- v2 reframes the demo as a preview of the next-time experience: "Next time you open Brightspace, this is what happens." This makes the demo forward-looking — the student is watching their future, not re-doing their past. It also makes "Skip" feel like "I get it, I don't need to see it" rather than "I'm giving up on the test."
- "Show me" is changed from "Try it now" to match the reframing.

---

## Overlay component spec

Used on all guided-click screens (Screens 5–10).

| Property | Value |
|---|---|
| Page dim | Semi-transparent dark overlay, ~50% opacity |
| Highlighted element | Full opacity, 3px white glow ring |
| Tooltip | Small pill, dark background, white text, max one sentence, attached to highlighted element with a 4–8px gap |
| Step counter | Small chip, bottom-right of overlay: "Step N of 4" |
| First-use primer | One additional tooltip line on Screen 5 only, explaining the overlay pattern |
| Animation | Fade-in on first appearance (~200ms). Subsequent steps crossfade (~150ms). |

The overlay must not cover the click target of the highlighted element. The dim layer sits behind the highlighted element in z-order.

---

## Interrupted onboarding

If the student closes the popup mid-flow, onboarding progress is saved in `browser.storage.session` (in-memory, not disk — consistent with existing draft-saving behavior).

On the next popup open, if onboarding is incomplete:
> "Welcome back — pick up where you left off."

With a CTA to resume at the last completed step.

Email, password, and the captured secret are all already in session storage per existing security invariants. This is purely a UI state persistence concern.

On Screen 4, the extension opens a CUNY tab. If the student closes the popup and reopens it, that tab may still be open or may be gone. Show a "Reopen CUNY tab" button? Reattaching silently to a tab the student may have navigated away from is surprising.

---

## Existing 2FA / Re-setup path

### All students already have 2FA

All CUNY students are required to use 2FA. The majority of authenticator apps (Microsoft Authenticator, Google Authenticator, Authy, Duo Mobile) do not let the user view or export the underlying secret — it is write-only from the student's perspective. A minority of apps, usually password managers (1Password, Bitwarden), do expose it.

Crucially: the CUNY self-service page only shows a censored version of existing secrets (`2Q************EU`). The **full secret is only visible once — during the "Add authentication factor" flow.** After the factor is saved, it cannot be retrieved from the CUNY page.

### Student is re-installing the extension

If a student already has a "CUNYAutoLogin" factor in CUNY and needs to re-install the extension, there are two paths:

**Path A — They have their secret saved somewhere** (rare; requires a password manager that exports TOTP secrets): offer a shortcut on Screen 1: a small link "Already set this up before?" below the "Let's go" button that leads to a single input screen where they paste their secret and skip the entire CUNY setup flow (Screens 4–10). They still go through extension password setup (Screen 11) and biometrics (Screen 12).

**Path B — They don't have their secret** (the common case): they must delete the existing CUNYAutoLogin factor in CUNY and go through the full setup flow again. The extension cannot recover or reuse the old secret — CUNY does not expose it.

For Path B, when the extension detects a "CUNYAutoLogin" factor already present on the "My Authentication Factors" page during setup, surface a popup message:

> It looks like CUNYAutoLogin is already set up in CUNY. To continue, you'll need to delete that entry first: click the three dots next to "CUNYAutoLogin" and select Delete, then come back here.

Do not automate deletion.