---
description: Engineering prime directives, pre-merge checklist, and what we never do
alwaysApply: true
---

# Code quality standards

## Prime directives

1. Write code that will be read by humans, not by AI.
2. Always choose the simplest solution. Add complexity only when it solves a real problem.
3. Always leave the codebase better than you found it.
4. Ask yourself: *"If I handed this to a skeptical senior engineer on a Friday afternoon before a holiday weekend, would they merge it without hesitation?"* If the answer is anything other than an unqualified yes, keep working.

## Comments

Explain the *why*, not the *what*. The code shows what — comments explain what constraint forced this decision or what non-obvious thing the next person must know. See `typescript-style` rule for codebase-specific examples.

Never leave commented-out code in a committed branch. Git history is the archive.

## What we do not do

- We do not merge code we don't understand.
- We do not skip tests because we're confident the change is safe.
- We do not use `any` as a way to avoid thinking about types.
- We do not optimize code before we have a profiler trace showing it's the bottleneck.
- We do not write code that only the original author can maintain.
- We do not add comments that restate what the code already says.

## Pre-merge checklist

Before requesting a review or considering a task done:

- [ ] Does every function do exactly one thing?
- [ ] Can a stranger understand each variable's purpose from its name alone?
- [ ] Are all error paths handled explicitly (typed, not swallowed)?
- [ ] Are there tests for the new behavior — including edge cases?
- [ ] Is there a test that would catch a regression if this broke?
- [ ] Are there any `TODO`s that should be tickets instead?
- [ ] Is there any commented-out code?
- [ ] Could a sleep-deprived on-call developer understand this at 3am?
