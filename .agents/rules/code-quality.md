<!-- Load when: reviewing code, running pre-merge checks, or assessing whether work is done -->

# Code quality standards

## Prime directives

1. Write code that will be read by humans, not by AI.
2. Always choose the simplest solution. Add complexity only when it solves a real problem.
3. Always leave the codebase better than you found it.
4. Ask: *"If I handed this to a skeptical senior engineer on a Friday afternoon before a holiday weekend, would they merge it without hesitation?"* If no, keep working.

## What we do not do

- We do not merge code we don't understand.
- We do not skip tests because we're confident the change is safe.
- We do not use `any` as a way to avoid thinking about types.
- We do not optimize before we have a profiler trace showing it's the bottleneck.
- We do not write code that only the original author can maintain.
- We do not add comments that restate what the code already says.

## Pre-merge checklist

- [ ] `npm run lint` passes zero errors and zero warnings (ESLint uses `--max-warnings 0`)?
- [ ] Every function does exactly one thing?
- [ ] Every function is under 80 lines (excluding blank lines / comments)?
- [ ] Can a stranger understand each variable's purpose from its name alone?
- [ ] No single-letter variables outside a `for` loop counter?
- [ ] All error paths handled explicitly (typed, not swallowed)?
- [ ] Tests for the new behavior — including edge cases?
- [ ] A test that would catch a regression if this broke?
- [ ] No stub or placeholder files that are never imported?
- [ ] No `TODO`s that should be tickets instead?
- [ ] No commented-out code?
- [ ] Every new CUNY page constant in `ssoSite.ts`?
- [ ] Could a sleep-deprived on-call developer understand this at 3am?
- [ ] **No silent breaking changes for installed users?** We are live on the Chrome Web Store (Firefox AMO listing pending). Changes to `StoredVault` shape, `cunyBiometricCredential` shape, crypto parameters (PBKDF2 iterations, salt/IV lengths, AES-GCM mode), `storage.local` keys, or the sidebar ↔ service-worker ↔ content-script message protocol need a forward migration or a version bump with the old reader retained for one release. See `CONTRIBUTING.md` § "Backward compatibility" and `.agents/rules/security.md`.
