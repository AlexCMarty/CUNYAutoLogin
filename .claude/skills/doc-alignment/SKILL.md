---
name: doc-alignment
description: Audit alignment between agent docs and repository reality by treating docs as hypotheses and code as source of truth. Use when the user asks for doc alignment, stale docs checks, trust-but-verify audits, or mismatch reports.
disable-model-invocation: true
---

# Doc Alignment Audit

## Purpose

Produce a mismatch-focused report on how well docs match the current repository.
Assume docs can be stale. Verify claims directly in code and config.

## Core Rules

1. Treat docs as hypotheses, never as facts.
2. Code and executable config are authoritative.
3. Every claim in the final report must include file evidence.
4. Mark uncertainty explicitly (`confirmed`, `contradicted`, `ambiguous`).
5. Prioritize contradictions by risk (`high`, `medium`, `low`).

## Inputs

- Target docs to audit (explicit list from user when possible).
- Repo scope (whole repo unless user narrows it).
- Optional focus areas: architecture, testing, security, style, build.

## Workflow

1. Build a claim list from docs:
   - Extract concrete, testable statements (counts, paths, script names, APIs, storage, flow ordering).
   - Ignore vague prose unless it implies behavior.
2. Validate each claim in code:
   - Check implementation files in `src/`.
   - Check runtime/build configs (`package.json`, Vite, TS, Playwright, manifests, CI workflows).
   - Check tests only to confirm what is asserted/tested today.
3. Classify each claim:
   - `confirmed`: code matches claim materially.
   - `contradicted`: code conflicts with claim.
   - `ambiguous`: claim cannot be verified from repo state alone.
4. Score risk for contradictions:
   - `high`: security, data safety, auth, crypto, permissions, irreversible behavior.
   - `medium`: user flow correctness, QA scope, build/release reliability.
   - `low`: naming, file-pointer drift, minor style/process wording.
5. Produce patch guidance:
   - Give exact doc file targets and short replacement bullets.
   - Favor precise wording over broad rewrites.

## Evidence Standard

- Cite exact file paths and symbols.
- Prefer primary sources over comments.
- If a doc claims counts/lists, compute from code, do not trust existing doc counts.
- If behavior depends on runtime mode, note mode constraints explicitly.

## Recommended Output Format

1. Overall alignment verdict (2-4 bullets).
2. Top contradictions (risk-ranked).
3. Confirmed high-value claims.
4. Ambiguous/unverifiable claims.
5. Doc patch queue by file.

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

- Do not "correct" code to match docs during an audit request unless user asks.
- Call out stale or absolute language (`always`, `never`, exact counts) as high-likelihood drift points.
- Distinguish "missing in docs" from "incorrect in docs".
