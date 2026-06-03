---
name: act-on-doc-alignment
description: Takes a doc-alignment report (produced by the `doc-alignment` skill, default `doc-alignment-report.md`) and applies the fixes to the listed doc files. Use when the user wants to act on the report: "fix the docs", "apply the alignment report", "act on the doc report", "patch the docs from the report", "address the doc findings", "work through the doc audit". This is the action half — it expects a report to exist; if none does, offer to run `doc-alignment` first. Only edits doc files — never touches src/, package.json, or any executable config.
---

# Act on Doc Alignment Report

## Purpose

Read `doc-alignment-report.md` (or a user-specified path), apply every fix in the patch queue and contradiction list to the actual doc files, and confirm what changed.

This skill only edits documentation files (`.md`, `.txt`, inline comments in non-executable config). It never modifies `src/`, `package.json`, Vite/TS config, manifests, or any file that affects runtime behavior.

## Inputs

- Report path: `doc-alignment-report.md` at repo root (default). Override if the user points at a different file.
- Scope filter: apply all findings unless the user says "only HIGH" or "only LOW" etc.

## Workflow

1. **Read the report.** Parse these sections:
   - `## Patch queue` — the primary action list; each row has a file, section, current text, and suggested replacement.
   - `## Contradictions` — supplement the queue; a contradiction without a patch queue row still needs a fix.
   - Skip `## Confirmed` and `## Ambiguous` sections — nothing to change there.

2. **Triage before touching anything.** Group fixes by target file. For each file, list the changes you're about to make and check that none of them:
   - Modify code, scripts, or executable config.
   - Contradict each other (two rows patching the same section differently).
   - Require information not in the report (if a fix says "add the correct path" but no correct path is given, flag it as unresolvable rather than guessing).

3. **Apply fixes file by file.**
   - Read the current file content first.
   - Apply the most specific match: prefer exact-string replacement over broad rewrites.
   - If the "current text" from the patch queue no longer matches (doc was already updated), skip that row and note it as already-fixed.
   - Preserve surrounding formatting, heading level, and list style.

4. **Verify each edit.** After writing each file, re-read the changed section and confirm the old text is gone and the new text reads coherently in context. If something looks wrong, revert that individual edit and flag it.

5. **Write a summary.** Print a short report inline (no extra file):

```
## Doc fix summary

### Applied
- CONTRIBUTING.md § Build — updated script name from `npm run build:prod` → `npm run build`
- .agents/rules/overview.md — corrected content script path

### Skipped (already fixed)
- README.md § Storage — text no longer matches; appears already updated

### Unresolvable (needs human)
- .agents/rules/flows.md § Auth — report says "update count" but gives no correct value
```

## Guardrails

- Never edit files in `src/`, `e2e/`, `dist/`, or any file with an extension other than `.md` or `.txt` (or inline doc comments explicitly cited in the report).
- If a patch row targets a code file by mistake, skip it and call it out in the summary.
- Do not invent fixes beyond what the report specifies. If the contradiction section implies a fix but gives no replacement text, flag it as unresolvable rather than guessing.
- Do not re-run doc-alignment after fixing — that's the user's call.

## Example fix

Report patch queue row:
```
| .agents/rules/overview.md | Content script path | `src/content/inject.ts` | `src/content/content.ts` |
```

Action: open `.agents/rules/overview.md`, find the string `src/content/inject.ts`, replace with `src/content/content.ts`, verify the line reads correctly in context.
