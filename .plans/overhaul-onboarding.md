# Onboarding Overhaul

## Goals

- A CUNY student who has never set up 2FA can complete onboarding unassisted.
- No technical jargon reaches the student unless unavoidable and immediately explained.
- Trust is established on Screen 1 and reinforced throughout.
- The student sees the extension work (aha moment) before they're done.

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
2. First login
3. Set up login codes
4. Extension password
5. Done

Beads fill in as stages complete. Individual screens within a stage do not get their own bead — they just animate through the active one. This keeps the top-level map simple even though there are ~13 internal screens.

**Placement:** the bead row sits pinned to the top of the sidebar on every screen from Screen 1 through Screen 13. Because the sidebar is persistent and the student can see it at all times (including while clicking through CUNY's self-service pages), the bead row doubles as an always-available map of where the student is in the flow.

### Design notes
- "Log in to CUNY" sounded like the whole goal of the extension — a student who saw that bead fill in would reasonably think they were done, and abandon before setting up login codes. "First login" frames it as one of several milestones without losing meaning.
- The sidebar's persistence makes the progress bar cheap and high-value: because the bead row remains visible while the student is clicking through CUNY's self-service pages (Screens 5–10a), it doubles as a constant map of where they are in the flow and how much is left. This is the riskiest stretch for abandonment, and a visible "3 of 5" anchor meaningfully reduces the "how much more of this is there?" pressure.

---

## Screen 1 — Welcome

**No back button. CTA: "Let's go"**

**Headline:** CUNYAutoLogin fills in your login and generates your verification codes for you.

**Body:** Setup takes about 5 minutes.

**Reassurance line** (same visual weight as the headline — not smaller):
Your login info is saved only on this device, encrypted. The extension sends it to CUNY's login page — the same place you'd type it yourself — and nowhere else.

**Authorship line** (small text, below the CTA):
An independent open-source project. Not affiliated with CUNY. [View the source code.](#)

### Design notes
- The reassurance line is **not** smaller text. For a user who is already skeptical about handing credentials to a browser extension, "saved only on this device" is the most important sentence on this screen — it earns the right to proceed. Reducing its size buries the trust signal under the marketing claim.
- The reassurance line must be factually accurate. A blanket "never sent anywhere" is false — the extension does send credentials to `ssologin.cuny.edu` by design. A skeptical student who notices the contradiction later will bail; a trusting student who doesn't notice will feel deceived at Screen 4. Naming the destination ("CUNY's login page — the same place you'd type it yourself") converts what could feel like a hidden data flow into an obvious, acceptable one.
- The authorship line answers the unasked question "who made this and am I trusting them?" Password-manager-grade trust requires an answer on Screen 1. The "not affiliated with CUNY" disclaimer also heads off any confusion from a student who assumed this was an official CUNY tool.
- The headline is a factual description of what the extension does, not a promise or a pitch. Promises ("never type your password again") read as bait before trust is established, and land identically to what a phishing extension would say.
- The 5-minute estimate is honest. Under-promising and over-running is the exact pattern that causes abandonment mid-flow ("I was told this would take 3 minutes and I'm 4 minutes in and still clicking menus"). Tell the student the real number.
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
We'll save these on your device, encrypted, and use them right now to log you in so you can watch it work.

**Input:** Pill-shaped. Password type. Show/hide toggle (eye icon) on the right side of the pill.

### Design notes
- The reassurance line does two jobs at once. At this point the student has handed a browser extension their school email and password. Without acknowledgment, the extension immediately runs off to do something with those credentials — which feels opaque to a skeptical user. The line answers the two open questions a skeptical student holds at this moment: "is this stored yet?" (yes, encrypted, on your device) and "what are you doing with it right now?" (logging you in once so you can see it work). It reframes handing over credentials from alarming to purposeful.
- Do not write "we'll use these to log you in once" without qualification — the extension will use them every time from now on. "Right now" is the truthful scope for what's about to happen; the ongoing use is the whole point of the product and doesn't need apologizing for on this screen.
- We discover wrong passwords during auto-login (Screen 5), not here. No content validation — just non-empty.
- Show/hide toggle is not optional. Students mistype passwords in narrow inputs constantly, especially on laptops with small keyboards.

---

## Screen 4 — "Opening CUNY…" (transition)

**Back button returns to Screen 3. No forward button.**

**Headline:** Opening CUNY Login…

**Body:** We're opening your school's login page in a new tab. We'll fill in your email and password so you can see how the extension works.

**Directional line** (below body):
Watch the CUNY tab. These instructions update on their own as you go.

**Reassurance line:** This is the same page you'd visit normally. We're not taking you anywhere unexpected.

**Visual:** Pulsing animation. Label beneath it: "Nothing to do yet — waiting for the tab to open."

**Behavior on open:**
- Extension opens `https://ssologin.cuny.edu/oaa/rui` in a new tab.
- CUNY redirects to the SSO login page. Content script fills email and password fields and submits.
- CUNY then challenges with a 6-digit verification code from the student's existing authenticator app. The sidebar animation label updates to: "Your phone's authenticator app is in charge for this one login — we haven't set ours up yet. Enter the 6-digit code on the CUNY tab like you normally would."
- After the student completes that step, CUNY shows the Allow/Deny consent page. Sidebar advances to Screen 5.
- The sidebar stays visible on this screen and monitors the tab throughout.

### Design notes
- The directional line orients the student across two visible surfaces — the CUNY tab and the sidebar. "Watch the CUNY tab" tells them where the action is; "these instructions update on their own" tells them the sidebar will keep up without any action on their part.
- The label beneath the pulsing animation ("Nothing to do yet") exists because a pulsing animation is ambiguous: it could mean "the extension is doing something" or "you're supposed to do something." Students who don't know they should switch to the tab will sit and wait. The label removes the ambiguity.
- The authenticator-handoff line ("Your phone's authenticator app is in charge for this one login…") bridges a real contradiction in the flow. The student installed this extension on the premise that it handles verification codes — and is now being told to pull out their phone. Without the bridge sentence, this is the moment mildly-skeptical becomes actively-skeptical ("wait, did this even work?"). Naming the reason — we haven't finished setup yet — converts confusion into a logical intermediate step.
- CUNY currently offers only a 6-digit authenticator code for this step. No push-notification / "approve from your phone" option exists, so the copy can be specific about the 6-digit code without worrying about branching.

---

## Screen 4-error — Wrong Credentials

If the content script detects a login error on the CUNY page (error message element present, or page has not advanced after submit):

**Do not retry automatically.** An extension that keeps submitting wrong credentials can lock a CUNY account.

**In the sidebar:** Immediately navigate to Screen 3 (or Screen 2 if the email is more likely wrong — content script signals the likely-wrong field to the background, which tells the sidebar where to land). Show a red inline error directly above the relevant input:
> "That email and password didn't work on CUNY. Double-check and try again."

The input is pre-filled with what the student typed — they're correcting, not starting over. The show/hide toggle on the password field is especially important here.

**On the CUNY tab:** Show an overlay banner at the top of the page. The banner must be **visually distinct from CUNY's own error messages** — it should read as "the extension is talking to me," not "CUNY is telling me something failed." Include the extension icon in the banner so the source is unambiguous.

Banner copy:
> "CUNYAutoLogin: your email or password didn't work. Fix it in the sidebar to keep going."

### Design notes
- The error must surface on the CUNY tab too, because the student's eyes are on that tab when the failed login happens — they may not have been looking at the sidebar when it updated. The on-page banner is a visual flag that says "glance back at the sidebar."
- Visual distinctness from CUNY's own alerts is critical. An extension-injected banner on a school-branded page can read as a phishing indicator to a skeptical student. The extension icon in the banner establishes authorship — this banner is from the extension, not from CUNY.
- Because the sidebar is always visible, it navigates itself directly to the correction screen and shows the error inline on the field the student needs to fix. The on-page banner and the sidebar update together; the student's eyes only have to move from one surface to the other.
- Naming the likely-wrong field (email vs password) in the routing reduces work for the student: the cursor is placed on whichever field the content script flagged as the probable culprit, and the inline error sits above that field. If the signal is ambiguous, default to the password (wrong-password is more common than wrong-email by the time the student has gotten past the `@login.cuny.edu` validation on Screen 2).

---

## Screen 5 — "Click Allow" gate

Auto-advances once the Allow action is detected on the CUNY page. **Back button returns to Screen 3. No forward button.**

**Headline:** One tap on the CUNY tab, then we keep going.

**Body:** CUNY is confirming it's really you before showing your account settings. Look for the prompt on the tab and click Allow.

**On the CUNY tab (overlay):**
- Page dimmed to ~50% opacity.
- "Allow" button highlighted (full opacity, soft white glow ring).
- Tooltip attached to the button — first overlay use, so include a primer line:
  > "The extension will guide you with highlights like this. Click Allow to continue."

After this first overlay use, subsequent overlays do not need the primer — the student now understands the pattern.

### Design notes
- The headline is honest about progress. "Almost there" on a screen where eight more screens follow teaches students not to trust the extension's status reporting — and a student who learns to distrust the UI at Screen 5 will not recover that trust by Screen 13. "One tap on the CUNY tab, then we keep going" is accurate about both the immediate action and the fact that more is coming.
- The body copy is specific about what Allow does: CUNY is confirming identity before showing account settings. A vague "CUNY is asking for permission to continue" reads as anxiety-inducing — students who have encountered phishing flows recognize unexpected permission dialogs as a red flag. Naming what the permission is for converts an alarming unknown into a recognizable step.
- The Allow/Deny page is a standard CUNY consent dialog that appears after login and the student's existing 6-digit code challenge. It reads: "Allow CUNY Login to access MFA Self-service? To set up or manage your CUNY Login MFA authentication factor(s), you must allow CUNY Login to access to the MFA self-service application. Click Allow to continue." The "Allow" button is on-screen on the computer — there is no phone prompt. CUNY does not offer push notification ("approve from your phone") at any point in this flow. The only 2FA method CUNY provides is a 6-digit authenticator code.
- The content script detects this page by the presence of the Allow and Deny buttons, highlights Allow, and auto-advances the sidebar once Allow is clicked and the next page loads.

---

## Screens 6–9 — Guided Clicks (CUNY Self-Service)

During these screens, the **sidebar shows a step-specific message** — one line of context explaining why the current step matters, plus the standing instruction. No forward button. Back button is available but returns to Screen 3 with a confirmation: "Going back will restart the CUNY setup steps. Are you sure?"

**Sidebar message format (per step):**

- **Step 1:** "Opening the page where CUNY lists your login methods. Follow the highlight on the CUNY tab."
- **Step 2:** "Telling CUNY to add a new login method — we'll be the one generating your codes. Follow the highlight on the CUNY tab."
- **Step 3:** "Picking the kind of code CUNY should expect (a 6-digit code). Follow the highlight on the CUNY tab."
- **Step 4:** "CUNY is about to show the setup code. We'll grab it for you. Follow the highlight on the CUNY tab."

A **step counter chip** sits in the bottom-right corner of the overlay on the CUNY tab throughout these steps:
`Step 1 of 4`, `Step 2 of 4`, etc.

### Design notes
- The guided-click section is the highest dropout risk in the flow — the student is navigating a government-style website they've never visited before, clicking through menus an extension is pointing at. A single static message ("Follow the highlights on the CUNY tab") gives the student no sense of what they are doing or why; four clicks in silence with no framing invites abandonment.
- Per-step context lines are short enough to read in a glance and give the student enough agency to feel like a participant rather than an obedient cursor.
- Language matters here. "Adding CUNYAutoLogin as a login method" reads to a skeptical student as "giving the extension permission to log in as me" — an alarm bell, not a reassurance. "Telling CUNY to add a new login method — we'll be the one generating your codes" frames the extension as taking on the authenticator-code job, which is the student's mental model of what they installed. The word "permission" is avoided throughout these steps for the same reason.

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

If the extension detects the page shows 5 existing factors (the maximum), **pause the overlay** and surface a sidebar message:

> You've hit CUNY's limit of 5 login methods. One has to go before we can add CUNYAutoLogin. If you see a factor named after an old phone, an old job, or something you don't recognize, that's usually safe to remove. If one is already called "CUNYAutoLogin" from a previous install, that's the safest to delete — we're about to set it up fresh. Click the three dots next to the one you picked and choose Delete, then come back to this step.

Do not automate deletion. Deleting an active factor can lock the student out of CUNY, so the decision stays with the student.

### Design notes
- The student picked this extension because they wanted something easier, not because they are a 2FA power user. A terse "you figure it out" at the exact moment the flow can't proceed is the worst place in the plan to leave them stranded — there is no path forward and no action to take.
- The "old phone / old job / unrecognized" heuristic is the minimum viable guidance. It doesn't tell the student which specific factor to delete (the extension can't know), but it gives them a filter to look through the list with. A student who truly recognizes none of their factors still needs to stop and think — that's correct, and no amount of copy fixes that — but most students will recognize at least one.
- The "already-named-CUNYAutoLogin is safest" note is a provably-correct fallback: if a prior install left a factor, the student is literally about to replace it anyway. This also cross-references the Path B re-install case at the bottom of the document.

---

### Screen 8 (overlay step 3 of 4) — Mobile Authenticator

Highlight the **Mobile Authenticator** option (the TOTP option).

Tooltip: "Select this to connect CUNYAutoLogin as your verification app."

**Sidebar message** (in addition to the standing step 3 line):
> "On the next step, we'll automatically save the setup code that CUNY shows — you won't need to do anything."

Do not use the word "TOTP" in the tooltip or anywhere student-facing.

### Design notes
- On Screen 9, the extension silently captures something from the CUNY page. Even with good intentions, "we captured something from that page without you seeing it" can feel intrusive the first time a user notices it. Priming the student one step earlier converts the Screen 9 confirmation from an announcement of something that happened behind their back into a confirmation of something they were told to expect.

---

### Screen 9 (overlay step 4 of 4) — Secret key page

When the secret key page loads, the extension silently captures the secret from the page. **The student never sees the raw key.** The sidebar status indicator updates:

> ✓ Connected to your CUNY account.

On the CUNY tab:
- Extension autofills the **Friendly Name** field with "CUNYAutoLogin".
- Tooltip on the field: "We've filled in a name for you."
- Highlight the **Verify Now** button.
- Tooltip: "Click Verify Now to confirm."

### Design notes
- "Your login code key was saved" uses two pieces of jargon ("login code key") that the student has never seen before in the flow. At this moment the student doesn't need a technical description of what was captured — they need confirmation that the thing the sidebar primed them for on Screen 8 ("we'll save the setup code") actually happened. "Connected to your CUNY account" matches the student's mental model: the extension is now linked to CUNY.

---

## Screen 10 — Verify Login Code (overlay)

Extension autofills the 6-digit verification code into the code field.

Highlight the **Verify and Save** button.
Tooltip: "Click Verify and Save to finish."

**On first error** (wrong code, expired code, or CUNY shows an inline validation message):
- Show overlay message below the button: "That code expired — we've entered a fresh one. Click Verify and Save again."
- Extension regenerates the code and autofills once automatically.

**On second failure:**
- Overlay pauses. Sidebar shows:
  > "That code didn't work. Wait a moment for it to refresh, then click Verify and Save once more."
- If the second failure persists, add: "This can happen if your device's clock is slightly off. Check your computer's time — if it looks right, close the sidebar and start setup again."
- Do not loop. After two failures, stop retrying and wait for the student to act.

**On success** (extension detects return to "My Authentication Factors" page, OR assumes success on button click):
- Sidebar auto-advances to Screen 10a.
- Overlay dismisses cleanly.

Detect return to the factors page by checking for "CUNYAutoLogin" in the factor list.

### Design notes
- The clock explanation is held back until the second failure. On first failure it's noise — the student doesn't know what their device clock has to do with a 6-digit code, and it introduces "something is wrong with my device" anxiety. The actionable message ("wait a moment, try again") is sufficient for first failure. The clock explanation only surfaces on a persistent second failure, where the student needs something actionable beyond "try again."
- The fallback gives the student a check before demanding a restart. "Restart your browser and run setup again" at the end of a 5-minute flow is the advice that makes a student give up on the extension entirely. "Check your computer's time" is a concrete thing the student can look at in 10 seconds, and — critically — has a ~50% chance of actually fixing the problem. Only if that check doesn't help do we suggest the nuclear option.

---

## Screen 10a — Set as Default (overlay)

**Immediately follows Screen 10 success** — the student is back on the "My Authentication Factors" page. No back button. No forward button.

CUNY uses whatever factor is marked "default" at next login. The newly added factor is not default automatically. If the student skips this step, their old authenticator app will be used and the extension will appear to not work.

**Two-click guided interaction:**

**Click 1 — Three-dot menu:**
- Highlight the three-dot (kebab) menu icon on the CUNYAutoLogin row.
- Tooltip: "Click the three dots next to CUNYAutoLogin."
- Sidebar message: "One last tap — make CUNYAutoLogin your default login method."

**Click 2 — Set as default:**
- After the menu opens, highlight the "Set as default" option.
- Tooltip: "Click Set as default."
- No additional sidebar message needed — the student is mid-gesture.

**Success detection:**
- Extension detects that CUNYAutoLogin is now marked as default on the "My Authentication Factors" page (e.g., a "default" badge or label appears on the CUNYAutoLogin row).
- On success, sidebar auto-advances to Screen 11. Overlay dismisses cleanly.

Do not auto-advance on the menu click alone — wait for the default badge to appear before advancing. A student who opens the menu and clicks something else should not trigger a false advance.

### Design notes
- This step is not optional. An extension that correctly fills credentials and generates codes will still appear broken if the old factor remains default — CUNY will challenge with the old app, not with the extension's code. Skipping this step causes a silent failure at the next real login, which is far harder to debug than a clear prompt during setup.
- The two-click structure (three dots → Set as default) is represented as one screen rather than two. Both clicks happen in rapid succession on the same page; splitting them into separate screens would overweight a trivial interaction. The overlay handles the sequencing.
- Avoid the bare word "default" in the sidebar message — it's jargon without context. "Make CUNYAutoLogin your default login method" is acceptable because "default" is immediately explained by what follows in the sentence.

---

## Screen 11 — Extension Password Setup

**Back button not available here** — credentials and secret are already staged. Returning would require clearing everything and starting over. If a student needs to go back, they can clear the extension from the browser.

**Headline:** Create your extension password

**Body:** This is separate from your CUNY password. It locks what we just saved on your device — you'll need it the next time you open your browser.

**Subtext directly below body** (same visual weight as body):
Pick something different from your CUNY password.

**Subtext at bottom:** If you forget this password, just run setup again — it takes about 5 minutes.

**Two inputs:**
- "Choose a password" — pill-shaped, password type, show/hide toggle.
- "Confirm password" — pill-shaped, password type, show/hide toggle.

**Inline validation:**
- Strength indicator below first input: Weak / Fair / Strong (red / yellow / green). Minimum accepted: Fair.
- Second input shows green checkmark when both match, red X while they don't match.

**Forward button:** Grayed until both fields match and strength is at least Fair.

### Design notes
- "Master password" is called "extension password" throughout. "Master" implies control over multiple services, which raises questions and anxiety. "Extension password" is scoped and self-explanatory.
- The "pick something different from your CUNY password" warning is critical and non-negotiable. The student typed their CUNY password two screens ago (Screen 3); muscle memory says to type it again now. Reusing the CUNY password here means the extension's on-disk vault is encrypted with the same secret the student uses for their entire school account — a meaningful regression in their security posture, silently. One sentence of warning, at full body weight, prevents this.
- The recovery framing is blunt. A vague "you'll need to set up the extension again" is ambiguous — a student reading it wonders if that means losing their CUNY account, reinstalling, or something worse. "Just run setup again — it takes about 5 minutes" tells them exactly what happens and that it's fine. Students under pressure will pick passwords they can remember if they know the stakes are recoverable.
- "The next time you open your browser" is concrete. Students don't think in "browser sessions" — they think in "I closed Chrome and opened it again."
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
- "Type my password each time" describes a deliberate choice and communicates what it means in practice — framing the second option as a fallback ("Use my password instead") would push the student toward biometrics regardless of fit. A student on a shared computer, library computer, or older device should not feel like they are choosing the worse option — the language should match the visual parity of the buttons.

---

### Screen 12a — Biometric preparation (shown before triggering system dialog)

**Only shown after tapping "Use Face ID / Fingerprint".**

**Body:** Your browser is about to ask for permission to use your fingerprint or face. This is handled by your device — not by us.

CTA: "Continue"

Then trigger the WebAuthn / platform authenticator prompt.

**On failure or denial:**
Provide option to try again. Sometimes fingerprint or face doesn't work the first time.
After the first error, show an option to continue instead with extension password. Show brief confirmation in the sidebar:
> "No problem — you'll use your extension password to unlock."

### Design notes
- The preparation screen exists purely to eliminate the jarring context switch when a native OS dialog appears mid-flow. Priming the student for it converts "alarming" into "expected."

---

## Screen 13 — "You're all set!" + Live Demo

**Headline:** You're all set!

**Body:** Next time you open Brightspace, this is what happens — no password needed.

**CTA button:** "Show me"

Tapping "Show me" opens `https://ssologin.cuny.edu` in a new tab and triggers AUTO_FILL_REQUEST. The student watches their email and password fill in automatically. This is the payoff moment.

**Live narration in the sidebar** — as the demo runs, the sidebar updates its status line in sync with what's happening on the tab:
- "Opening CUNY Login…"
- "Filling in your email…"
- "Filling in your password…"
- "Generating your login code…"
- "Logged in."

Each line replaces the previous with a soft crossfade. The student sees two synchronized surfaces: the tab doing the work, and the sidebar narrating it.

After the fill is detected (or after 10 seconds with no tab activity, as a fallback), sidebar updates:
> That's it. Enjoy never logging in manually again.

**Secondary link** (small, below the button): "Skip" — for students who don't want the demo.

### Design notes
- The demo is framed as a preview of the next-time experience: "Next time you open Brightspace, this is what happens." This makes the demo forward-looking — the student is watching their future, not re-doing their past. It also makes "Skip" feel like "I get it, I don't need to see it" rather than "I'm giving up on the test." A framing of "Try it now" would read as a test, implying setup might not have worked, and the student just went through an entire login flow as part of setup.
- Live narration is what makes the demo a real payoff instead of a silent animation. The student's eyes are on the tab watching the fill happen, but the sidebar stays visible next to it, labeling each action as it occurs ("Filling in your email…" → "Generating your login code…" → "Logged in."). This is the Screen 1 trust promise ("we fill in your login and generate your verification codes") being kept, in plain language, while the student watches — not a black-box animation they have to take on faith.

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

Because the sidebar is a persistent surface that stays open while the student clicks around the browser, the interruption cases that matter are different from a closable UI. The three real cases:

**Case 1 — Student closes the sidebar itself** (rare; requires a deliberate action in the browser chrome). Onboarding progress is saved in `browser.storage.session` (in-memory, not disk — consistent with existing draft-saving behavior). On the next sidebar open, if onboarding is incomplete:

> "Welcome back — pick up where you left off."

With a CTA to resume at the last completed step.

**Case 2 — Student closes the CUNY tab mid-flow** (Screens 4 through 10a). The sidebar is still open and aware of which step the student was on, but the tab it was driving is gone. The sidebar shows a persistent "Reopen CUNY tab" button throughout Screens 4–10a so the student can always get the tab back without losing their place. Tapping it opens a fresh CUNY tab and the content script re-establishes the overlay at the appropriate step.

**Case 3 — Student closes the whole browser.** Session storage is cleared by design (email, password, and captured secret are all session-only per the security invariants). On next open, the student lands on Screen 1. This is intentional and must not be "fixed" with `storage.local` — the security posture depends on credentials being in-memory-only until the vault is sealed with the extension password on Screen 11.

Email, password, and the captured secret are all already in session storage per existing security invariants. Case 1 is purely a UI state persistence concern.

### Design notes
- The "Reopen CUNY tab" button is the correct answer to the question "is reattaching to a tab surprising?" It is not surprising because the student is the one who closed the tab, and the button describes exactly what it does. The sidebar can surface this affordance in plain sight, conditionally — it only appears when the CUNY tab is actually absent, so it never clutters the normal flow.
- Case 3 (whole-browser close) is worth documenting explicitly because it looks like a bug from the outside. A future developer looking to "preserve progress across browser restarts" will want to persist setup state to disk — do not. The credentials in flight are the exact thing that must not hit disk unencrypted.

---

## Existing 2FA / Re-setup path

### All students already have 2FA

All CUNY students are required to use 2FA. The majority of authenticator apps (Microsoft Authenticator, Google Authenticator, Authy, Duo Mobile) do not let the user view or export the underlying secret — it is write-only from the student's perspective. A minority of apps, usually password managers (1Password, Bitwarden), do expose it.

Crucially: the CUNY self-service page only shows a censored version of existing secrets (`2Q************EU`). The **full secret is only visible once — during the "Add authentication factor" flow.** After the factor is saved, it cannot be retrieved from the CUNY page.

### Student is re-installing the extension

If a student already has a "CUNYAutoLogin" factor in CUNY and needs to re-install the extension, there are two paths:

**Path A — They have their secret saved somewhere** (rare; requires a password manager that exports TOTP secrets): offer a shortcut on Screen 1: a small link "Already set this up before?" below the "Let's go" button that leads to a single input screen where they paste their secret and skip the entire CUNY setup flow (Screens 4–10). They still go through extension password setup (Screen 11) and biometrics (Screen 12).

**On the Path A input screen:**

**Headline:** Paste your saved setup code

**Body:** Only paste a code you saved yourself from a previous CUNYAutoLogin setup, exported from your password manager.

**Warning line** (same visual weight as the body, red accent):
Do not paste anything you were just sent in an email, text, or chat. Legitimate setup codes are never sent to you.

**Input:** multi-line text area, monospaced, with a "Paste" button.

### Design notes (Path A)
- A blank paste-your-secret input is a phishing invitation — any attacker who convinces a student to "paste this code into your extension to fix a problem" now has full control of the student's 2FA. The warning line names the attack pattern in plain language ("never sent to you in email, text, or chat") so a student under social engineering has a chance to recognize what is happening before they paste. This is not theoretical; password-reset / 2FA-reset phishing of college students is routine.
- The warning must be body weight and colored, not subtext. A student who got to this screen because someone told them to is exactly the student who will skim past small gray text.

**Path B — They don't have their secret** (the common case): they must delete the existing CUNYAutoLogin factor in CUNY and go through the full setup flow again. The extension cannot recover or reuse the old secret — CUNY does not expose it.

For Path B, when the extension detects a "CUNYAutoLogin" factor already present on the "My Authentication Factors" page during setup, surface a sidebar message:

> It looks like CUNYAutoLogin is already set up in CUNY. To continue, you'll need to delete that entry first: click the three dots next to "CUNYAutoLogin" and select Delete, then come back here.

Do not automate deletion.