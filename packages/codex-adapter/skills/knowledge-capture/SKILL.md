---
name: knowledge-capture
description: Use only when the user explicitly asks to manually capture already-established knowledge from a non-claw task into project Truth and ADR. Never invoke automatically or recommend it based on inferred knowledge value.
---

# Knowledge capture

This is an explicit, same-agent manual knowledge-capture flow. It is not a claw workflow and must never be invoked automatically by an agent.

## Boundaries

- Start only on a direct user request to capture knowledge manually. Do not infer the request from task completion, code changes, or reusable conclusions.
- Do not use this skill from a claw plan, subplan, automatic closeout, report, transcript, finalization job, or a delegated agent.
- Do not create a plan, report, subplan, task, job, background worker, thread, or collaboration subagent.
- Use only conclusion-bearing material already present in the current agent's task memory before invocation. Do not recover missing evidence from a transcript, earlier report, or fresh implementation research.
- If context compaction leaves the evidence insufficient, stop without editing and tell the user what material is missing.

## Manual flow

1. Run `claw knowledge prepare --source agent-memory --project-root "<project-root>"`.
2. Treat the returned `assignments`, resource paths, assignment order, and `configFingerprint` as the only current configuration authority. Do not read `.claw/project.json` directly or use `claw context` as a substitute.
3. Before writing, ensure every returned external skill is available and can run in the current agent without delegation. If any requires a subagent, thread, background worker, or confirmation, stop before all writes and report the incompatible assignment.
4. Read every returned built-in contract and format resource in full. Follow its evidence, freshness, Truth-before-ADR, ownership, formatting, and consistency rules. For external assignments, follow the returned prompt in order. Do not copy or replace the project's configured assignment route.
5. Keep an in-memory list of canonical Markdown files actually changed under the returned `truthDir`. Do not write a report or a separate memory note.
6. Run `claw knowledge complete --source agent-memory --project-root "<project-root>" --config-fingerprint "<fingerprint>" --changed-truth "<absolute-truth-path>"` once for each changed Truth/ADR Markdown path. If none changed, do not run complete; report the evidence-backed no-edit outcome.
7. If complete reports configuration drift, governance failure, or refresh failure, leave existing edits visible, do not claim success, and ask the user whether to retry after a new prepare.

## Completion

State what canonical knowledge changed, which configured assignments ran, and any skipped claims. Never claim that a report, job, subagent, or automatic finalizer participated.
