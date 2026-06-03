---
name: doc-alignment
description: Audit alignment between agent docs and repository reality by treating docs as hypotheses and code as source of truth. Use proactively when the user asks anything like "are my docs accurate?", "check the README", "does CONTRIBUTING.md reflect what's in the code?", "verify the docs", "stale docs", "trust-but-verify audit", or "mismatch report". Also invoke when the user points at any doc file and asks whether it's up to date, even if they don't use the word "audit".
disable-model-invocation: false
---

# Doc Alignment Audit

## Purpose

Produce a mismatch-focused report on how well docs match the current repository.
Assume docs can be stale. Verify claims directly in code and config.
Write the report to `doc-alignment-report.md` at the repo root. Do not patch any docs or code — this is an audit-only skill.

## Core Rules

1. Treat docs as hypotheses, never as facts.
2. Code and executable config are authoritative.
3. Every claim in the final report must include file evidence.
4. Mark uncertainty explicitly (`confirmed`, `contradicted`, `ambiguous`).
5. Prioritize contradictions by risk (`high`, `medium`, `low`).

## Inputs

- Target docs to audit: use the explicit list from the user if provided. If none is given, auto-discover by scanning the repo for `.md` files in the root, `docs/`, `.agents/`, `.claude/`, and any `*CONTRIBUTING*` or `*README*` files found anywhere.
- Repo scope: whole repo unless user narrows it.
- Optional focus areas: architecture, testing, security, style, build.

## Workflow

1. **Discover docs** (if no explicit list): scan for `.md` files per the targets above. List them at the top of the report so the user knows what was audited.
2. **Build a claim list** from each doc:
   - Extract concrete, testable statements (counts, paths, script names, APIs, storage, flow ordering).
   - Ignore vague prose unless it implies behavior.
3. **Validate each claim** in code:
   - Check implementation files in `src/`.
   - Check runtime/build configs (`package.json`, Vite, TS, Playwright, manifests, CI workflows).
   - Check tests only to confirm what is asserted/tested today.
4. **Classify each claim**:
   - `confirmed`: code matches claim materially.
   - `contradicted`: code conflicts with claim.
   - `ambiguous`: claim cannot be verified from repo state alone.
5. **Score risk** for contradictions:
   - `high`: security, data safety, auth, crypto, permissions, irreversible behavior.
   - `medium`: user flow correctness, QA scope, build/release reliability.
   - `low`: naming, file-pointer drift, minor style/process wording.
6. **Produce patch guidance**:
   - Give exact doc file targets and short replacement bullets so a follow-up agent can act on them.
   - Favor precise wording over broad rewrites.
7. **Write `doc-alignment-report.md`** at the repo root using the output format below.

## Evidence Standard

- Cite exact file paths and symbols.
- Prefer primary sources over comments.
- If a doc claims counts/lists, compute from code — do not trust existing doc counts.
- If behavior depends on runtime mode, note mode constraints explicitly.

## Output Format

Write `doc-alignment-report.md` at the repo root. Use this structure:

```markdown
# Doc Alignment Report

_Generated: <date>_

## Docs audited
- <list of files checked>

## Overall verdict
- <2-4 bullets summarizing alignment health>

## Contradictions (risk-ranked)

### HIGH
- **[doc-file:line]** Claim: "…" → Reality: `src/foo.ts:42` does X instead. Patch: replace with "…".

### MEDIUM
- …

### LOW
- …

## Confirmed high-value claims
- **[doc-file]** "…" — confirmed at `src/bar.ts:10`.

## Ambiguous / unverifiable
- **[doc-file]** "…" — cannot be verified from repo state; depends on runtime environment.

## Patch queue
| File | Section | Current text (excerpt) | Suggested replacement |
|------|---------|------------------------|----------------------|
| CONTRIBUTING.md | Build | "run `npm run build:prod`" | "run `npm run build`" |
```

## Example contradiction entry

```
### MEDIUM
- **[.agents/rules/overview.md]** Claims the content script lives at `src/content/inject.ts`
  → Reality: file is `src/content/content.ts` (verified via `find src/content -name "*.ts"`).
  Patch: update path reference to `src/content/content.ts`.
```

## Subagent Strategy

When subagents are available, parallelize by concern:

- Architecture/flows audit
- Testing/process audit
- Security/style audit

For Cursor, spawn **Composer** subagents.
For Claude Code, spawn **Sonnet** subagents.

Run a final synthesis pass that:

- de-duplicates overlaps,
- resolves conflicts,
- re-ranks severity,
- and spot-checks top risks directly.

If your environment cannot spawn a requested model, keep this strategy but adapt model selection manually per environment limits.

## Guardrails

- Do not patch docs or code during an audit — report only. A separate agent handles fixes.
- Call out stale or absolute language (`always`, `never`, exact counts) as high-likelihood drift points.
- Distinguish "missing in docs" from "incorrect in docs".
