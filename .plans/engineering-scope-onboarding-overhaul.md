# Engineering Scope Doc: Onboarding Overhaul

## Document status

- Status: Proposed for engineering implementation
- Input specs: `.plans/overhaul-onboarding.md`
- Product/UX status: Approved
- Engineering stance: Feasible with phased delivery; not safe as a one-shot implementation

---

## 1) Problem statement

New CUNY students abandon setup when trust is low, language is technical, or CUNY self-service steps are confusing. The current setup UI is a form-first vault workflow, while the approved UX requires a guided, outcome-first onboarding experience with synchronized sidebar instructions and in-page guidance.

The goal of this scope is to translate the approved UX plan into a low-risk engineering rollout with explicit constraints, fallbacks, and test gates.

---

## 2) Success criteria

### User outcomes

- First-time student can complete setup without external help.
- Student understands where credentials are sent and why.
- Student reaches a visible "it worked" moment before exit.

### Delivery outcomes

- No regression in existing locked/unlocked vault security invariants.
- No plaintext secrets persisted to disk before vault save.
- No silent failure states in the guided CUNY sequence.

### Operational outcomes

- E2E coverage for the happy path and top drop-off edges.
- All critical transitions observable in debug logs (development only).

---

## 3) Scope boundaries

## In scope (this initiative)

- Replace current setup path with a screen-based onboarding controller.
- Implement 5-bead progress model mapped to internal sub-steps.
- Add guided CUNY flow orchestration from first login through factor defaulting.
- Add explicit wrong-credential handling with no auto-resubmit loop.
- Add extension password step and conditional biometric step.
- Add final "Show me" payoff demo flow.
- Add interruption handling behavior for sidebar close and CUNY tab close.
- Add re-setup path detection and guidance for existing CUNYAutoLogin factor.

## Out of scope (for now)

- Full localization/i18n framework.
- Server-backed telemetry pipeline (if desired, use local/dev instrumentation first).
- OCR/computer-vision guidance outside known DOM selectors.
- Any persistence of in-flight credentials/secrets beyond current security model.

---

## 4) Technical feasibility summary

## Already available in repo

- Side panel entry and controller surface: `src/sidebar/sidebar.ts`, `src/popup/popup.ts`.
- CUNY page automation primitives: `src/content/content.ts`.
- Message routing and vault/session access: `src/background/service-worker.ts`.
- Centralized CUNY URL/DOM contract: `src/cuny/ssoSite.ts`.

## New engineering needed

- Dedicated onboarding state machine and screen renderer.
- Cross-context event protocol for step detection + UI synchronization.
- Overlay engine for CUNY guided clicks (highlight + tooltip + step chip).
- Recovery/fallback logic for CUNY DOM variance and timing race conditions.

## Feasibility verdict

- Technically possible: Yes.
- Highest risk: brittle CUNY selector logic and state desync across tab/sidebar/background.
- Recommended approach: phased rollout with hard exit criteria per phase.

---

## 5) Architecture plan

## 5.1 New onboarding state model

Create explicit state machine (source of truth in side panel controller), e.g.:

- `WELCOME`
- `EMAIL_ENTRY`
- `PASSWORD_ENTRY`
- `OPENING_CUNY`
- `CREDENTIAL_ERROR`
- `ALLOW_GATE`
- `GUIDED_MANAGE`
- `GUIDED_ADD_FACTOR`
- `GUIDED_FACTOR_TYPE`
- `GUIDED_SECRET_CAPTURE`
- `VERIFY_LOGIN_CODE`
- `SET_DEFAULT`
- `EXT_PASSWORD_SETUP`
- `BIOMETRIC_OFFER`
- `BIOMETRIC_PREP`
- `COMPLETE_DEMO`
- `COMPLETE_DONE`

Each state defines:

- Enter action
- Expected external signal(s)
- Timeout/fallback behavior
- Back navigation behavior
- Bead stage mapping (`1..5`)

## 5.2 Message protocol changes

Add typed runtime messages between side panel, background, and content script for:

- CUNY page stage detection updates
- Wrong-credential detection + likely culprit hint
- Overlay show/update/hide commands
- Verify-code retry status updates
- "Reopen CUNY tab" trigger and reattach confirmation

Protocol must be versioned or guarded with type narrowing to avoid runtime drift.

## 5.3 Overlay engine

Implement in content script:

- Dim layer + pass-through highlight ring around target element.
- Tooltip anchor resolution with collision-safe placement.
- Step counter chip for guided sub-steps.
- Distinct extension-authored banner style for error notices.

Must fail soft:

- If target element not found within timeout, emit `TARGET_NOT_FOUND` to sidebar and provide actionable recovery copy.

## 5.4 Storage and security invariants

Must preserve:

- Master/extension password never persisted to `storage.local`.
- Pending TOTP secret staged only in `storage.session`.
- In-progress drafts/session data remain session-scoped until vault save.

No exceptions in this initiative.

---

## 6) Phased delivery plan

## Phase 1: Foundation + early trust flow (Screens 1-4 + wrong-credential path)

### Deliverables

- New screen renderer + progress beads.
- Screens 1-4 copy and transition behavior.
- Open CUNY tab + observe credential auto-fill progression.
- Wrong-credential return path (`Screen 4-error`) with sidebar and tab banner.

### Exit criteria

- Student can move from welcome to first login attempt in guided flow.
- No auto-retry loop on failed credentials.
- E2E tests for:
  - Valid login path into Allow page detection
  - Wrong credentials and return-to-edit flow

## Phase 2: Guided CUNY self-service (Screens 5-10a)

### Deliverables

- Overlay component (highlight, tooltip, step chip, primer).
- Guided steps 5-10a including:
  - Allow gate
  - Manage -> Add factor -> Mobile Authenticator -> Verify Now
  - Capture secret and verify code handling
  - Set-as-default two-click flow
- Five-factor edge handling pause message.

### Exit criteria

- Happy path completes through default-factor confirmation.
- Verify-code retry policy enforced: one automatic regeneration, then student-driven retry.
- E2E tests for:
  - Full guided happy path
  - Five-factor edge pause
  - Verify-code first failure and second failure behavior

## Phase 3: Completion + resume paths (Screens 11-13 + interruptions + reinstall)

### Deliverables

- Extension password creation screen with inline strength/match checks.
- Conditional biometric offer and prep flow.
- Final live demo + narrated status updates.
- Interrupted onboarding cases:
  - Sidebar close + resume
  - CUNY tab close + reopen
  - Browser close reset behavior (intentional)
- Existing-factor reinstall messaging and Path A/Path B routing.

### Exit criteria

- Onboarding complete path ends with live demo or skip.
- Resume paths work without violating session-only security rules.
- E2E tests for interruption and reinstall edges.

---

## 7) Risk register and mitigations

## Risk: CUNY DOM changes break guided selectors

- Severity: High
- Mitigation:
  - Keep selectors centralized in `src/cuny/ssoSite.ts` and selector map modules.
  - Use multi-signal detection (text + role + nearby headings) where feasible.
  - Emit actionable fallback when target not found; never hang silently.

## Risk: State desync between sidebar and CUNY tab

- Severity: High
- Mitigation:
  - One canonical onboarding state in sidebar.
  - Idempotent event handling with dedupe by step key.
  - Timeout watchdog per waiting state with explicit user recovery action.

## Risk: Security regression while adding resume/edge paths

- Severity: Critical
- Mitigation:
  - Security invariants checklist in PR template for this initiative.
  - Unit tests around storage key usage and clear-on-lock/reset behavior.
  - Explicit review of any `storage.local` writes touching onboarding code.

## Risk: Scope inflation from "pixel-perfect all at once"

- Severity: Medium
- Mitigation:
  - Phase gates with strict in/out scope.
  - Defer cosmetic enhancements that do not affect comprehension or completion.

---

## 8) Test strategy

## Unit tests

- State machine transition validity and guard conditions.
- Message type guards and payload validation.
- Fallback behavior for missing selector/timeouts.
- Password strength + match validation logic.

## Integration tests (extension contexts)

- Background/content/sidebar message flow for key transitions.
- Secret staging + consumption + clearing semantics.
- Resume behavior for sidebar close and CUNY tab close.

## E2E (Playwright fixtures)

- Full happy path from Screen 1 to Screen 13.
- Wrong credential handling and correction path.
- Five-factor limit block.
- Verify retry and clock-drift hint branch.
- Set-as-default detection branch.
- Reinstall existing factor branch (Path B).

---

## 9) Release and rollout plan

- Internal dogfood in dev/e2e fixtures first.
- Manual sanity on real CUNY pages in Chromium and Firefox after each phase.
- Release behind a feature flag if both old and new onboarding need coexistence during migration.
- Rollback condition: inability to complete guided path due to selector breakage without clear fallback.

---

## 10) Team ownership and decision log

## Suggested ownership

- Engineering: state machine, message protocol, overlay robustness, tests.
- UX: final copy validation and fallback microcopy approval.
- PM: phase acceptance and launch sequencing decisions.

## Decisions locked by this scope

- No one-shot implementation.
- No auto-delete of CUNY factors.
- No persistent disk storage for in-flight onboarding secrets before vault save.
- No silent retries for potentially lockout-prone auth failures.

---

## 11) Open questions requiring PM/UX confirmation

- Is Path A (paste previously saved secret) in Phase 3 required for first launch, or can it ship in a follow-up patch? ANSWER: ship in follow-up patch
- Should "Skip demo" count as onboarding completion for product analytics? ANSWER: yes
- Do we require feature-flag toggling support for gradual rollout, or launch all-at-once after internal validation? ANSWER: launch all at once after extensive internal validation

---

## 12) Definition of done (initiative)

- All three phases meet exit criteria.
- Security invariants verified in review and tests.
- E2E suite covers happy path + critical edge paths listed above.
- PM and UX sign off on implemented behavior parity against `.plans/overhaul-onboarding.md`.

