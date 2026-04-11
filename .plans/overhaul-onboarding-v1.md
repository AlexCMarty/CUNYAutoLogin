# Onboarding Overhaul v1

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

**Headline:** Never type your CUNY password again.

**Body:** CUNYAutoLogin fills in your login and generates your verification codes for you. Setup takes about 3 minutes.

**Reassurance line** (smaller text, bottom of card):
Your information is stored only on this device and is never sent anywhere.

### Design notes
- No step-by-step preview of the flow. Listing "annoying steps" upfront causes abandonment before it starts.
- The reassurance line uses plain language, not "encrypted" or "AES" — the student does not know what those mean and "encrypted" can read as corporate deflection.

---

## Screen 2 — Email Entry

**No back button. Forward button grayed until input is valid.**

**Label:** What's your CUNYfirst email?

**Subtext directly below label:**
This is your login for Brightspace — usually firstname.lastname@login.cuny.edu. It is not your @baruchmail.cuny.edu or other school email.

**Input:** Pill-shaped. Prefilled value: `@login.cuny.edu`. Cursor placed before the `@` on focus.

**Forward button behavior:**
- Grayed until input is non-empty and ends with `@login.cuny.edu`.
- If the student types a non-`@login.cuny.edu` address and tabs/taps away, inline hint appears below the input:
  > "CUNY logins end in @login.cuny.edu — check your CUNYfirst welcome email if you're unsure."

### Design notes
- The @login.cuny.edu vs school email distinction is the single biggest source of wrong-credential failures. Address it here, not after the failure happens.

---

## Screen 3 — Password Entry

**Back button returns to Screen 2. Forward button grayed until input is non-empty.**

**Label:** What's your CUNYfirst password?

**Subtext directly below label:**
The password you use to log in to Brightspace.

**Input:** Pill-shaped. Password type. Show/hide toggle (eye icon) on the right side of the pill.

### Design notes
- We discover wrong passwords during auto-login (Screen 5), not here. No content validation — just non-empty.
- Show/hide toggle is not optional. Students mistype passwords in narrow inputs constantly, especially on laptops with small keyboards.

---

## Screen 4 — "Opening CUNY…" (transition)

**Back button returns to Screen 3. No forward button.**

**Headline:** Opening CUNY Login…

**Body:** We're opening your school's login page in a new tab. We'll fill in your email and password so you can see how the extension works.

**Reassurance line:** This is the same page you'd visit normally. We're not taking you anywhere unexpected.

**Visual:** Pulsing animation — not a spinner (spinners imply waiting on the extension; this is waiting on the student).

**Behavior on open:**
- Extension opens `https://ssologin.cuny.edu/oaa/rui` in a new tab.
- Content script fills email and password fields.
- Popup stays open on this screen and monitors the tab.

---

## Screen 4-error — Wrong Credentials

If the content script detects a login error on the CUNY page (error message element present, or page has not advanced after submit):

**Do not retry automatically.** An extension that keeps submitting wrong credentials can lock a CUNY account.

**On the CUNY tab:** Show an overlay banner at the top of the page (styled to match the rest of the overlay component — not injected as page content):
> "CUNYAutoLogin: your email or password didn't work. Tap here to correct them."

Tapping the banner focuses the popup and returns to Screen 3 (password entry). If the email is more likely wrong (e.g. format mismatch was just discovered), return to Screen 2 instead.

**On the popup:** Replace the pulsing animation with a red status line:
> "That didn't work — tap the banner on the CUNY tab to fix your email or password."

### Design notes
- The error must surface on the webpage because the student is not looking at the popup during auto-login. Popup-only errors are invisible here.

---

## Screen 5 — "Click Allow" gate

Auto-advances once the Allow action is detected on the CUNY page. **Back button returns to Screen 3. No forward button.**

**Headline:** Almost there — one more tap on the CUNY tab.

**Body:** CUNY is asking for permission to continue. Look for the prompt on the tab and click Allow.

**On the CUNY tab (overlay):**
- Page dimmed to ~50% opacity.
- "Allow" button highlighted (full opacity, soft white glow ring).
- Tooltip attached to the button — first overlay use, so include a primer line:
  > "The extension will guide you with highlights like this. Click Allow to continue."

After this first overlay use, subsequent overlays do not need the primer — the student now understands the pattern.

---

## Screens 6–9 — Guided Clicks (CUNY Self-Service)

During all of these screens, the **popup shows a single persistent message:**

> Follow the highlights on the CUNY tab. We'll move forward automatically after each step.

No forward button. Back button is available but returns to Screen 3 with a confirmation: "Going back will restart the CUNY setup steps. Are you sure?"

A **step counter chip** sits in the bottom-right corner of the overlay on the CUNY tab throughout these steps:
`Step 1 of 4`, `Step 2 of 4`, etc. This is the only progress indication during this section — it reframes "click the highlighted thing" from blindly following into making measurable progress.

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

Do not link to a help article. If they truly have 5 2FA they can figure it out

---

### Screen 8 (overlay step 3 of 4) — Mobile Authenticator

Highlight the **Mobile Authenticator** option (the TOTP option).

Tooltip: "Select this to connect CUNYAutoLogin as your verification app."

Do not use the word "TOTP" in the tooltip or anywhere student-facing.

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

**On error** (wrong code, expired code, or CUNY shows an inline validation message):
- Show overlay message below the button: "That code expired — we've entered a fresh one. Click Verify and Save again."
- Extension regenerates the code and autofills once automatically.
- On second failure: overlay pauses. Popup shows:
  > "The code didn't verify. This sometimes happens if your device clock is slightly off. Wait for the code to refresh (codes change every 30 seconds) and click Verify and Save once more."
- Do not loop. After two failures, stop retrying and wait for the student to act.

**On success** (extension detects return to "My Authentication Factors" page, OR assumes success on button click):
- Popup auto-advances to Screen 11.
- Overlay dismisses cleanly.

Detect success by checking for "CUNYAutoLogin" on the factors page.

---

## Screen 11 — Extension Password Setup

**Back button not available here** — credentials and secret are already staged. Returning would require clearing everything and starting over. If a student needs to go back, they can clear the extension from the browser.

**Headline:** Create your extension password

**Body:** This is separate from your CUNY password. It locks what we just saved on your device — you'll need it when you open a new browser session.

**Subtext at bottom:** If you forget this password, you'll need to set up the extension again. We can't recover it.

**Two inputs:**
- "Choose a password" — pill-shaped, password type, show/hide toggle.
- "Confirm password" — pill-shaped, password type, show/hide toggle.

**Inline validation:**
- Strength indicator below first input: Weak / Fair / Strong (red / yellow / green). Minimum accepted: Fair.
- Second input shows green checkmark when both match, red X while they don't match.

**Forward button:** Grayed until both fields match and strength is at least Fair.

### Design notes
- "Master password" is renamed "extension password" throughout. "Master" implies control over multiple services, which raises questions and anxiety. "Extension password" is scoped and self-explanatory.
- Minimum strength "Fair" rather than "Strong" reduces abandonment while still ruling out "1234". Students under pressure will pick bad passwords if blocked by overly strict requirements — Fair is a pragmatic floor.

---

## Screen 12 — Biometrics (conditional)

**Only show this screen if the browser reports a platform authenticator is available.** If not available, skip directly to Screen 13.

**Headline:** Unlock faster with Face ID or fingerprint

**Body:** Instead of typing your extension password each time, use your device's built-in fingerprint or face scanner.

**Two equal-weight buttons** (same visual size and color — neither is "primary"):
- "Use Face ID / Fingerprint"
- "Use my password instead"

No "skip" label on the second option. Both are legitimate choices. A student on a shared computer, library computer, or older device should not feel like they are choosing the worse option.

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

**Body:** CUNYAutoLogin is ready. Let's make sure it's working.

**CTA button:** "Try it now"

Tapping "Try it now" opens `https://ssologin.cuny.edu` in a new tab and triggers AUTO_FILL_REQUEST. The student watches their email and password fill in. This is the payoff moment — the tangible proof that 15 minutes of setup was worth it.

After the fill is detected (or after 10 seconds with no tab activity, as a fallback), popup updates:
> That's it. Enjoy never logging in manually again.

**Secondary link** (small, below the button): "Skip test" — for students who don't want the demo. They see the "You're all set!" screen and can close the popup.

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

---

## Changes from v0

| v0 | v1 |
|---|---|
| Flow preview lists technical steps on welcome screen | Welcome screen is benefit-first, no step list |
| "TOTP secret" input field in popup | Silent capture — student never sees raw key |
| "TOTP", "secret key", "master password" in student-facing copy | Replaced throughout with plain language |
| Error feedback during auto-login shown only in popup | Error surfaces as overlay banner on the CUNY tab |
| Overlay appears with no explanation on first use | First-use primer tooltip explains the pattern |
| No step counter during guided clicks | Step counter chip on overlay throughout |
| Biometrics framed as enroll vs. skip | Two equal-weight choices, no "skip" language |
| "You're all set!" with no proof it works | Live demo step — student watches it fill |
| Master password screen has no framing | Extension password screen explains why it exists |
| No interrupted-onboarding handling | Session state persists progress; resume on reopen |
