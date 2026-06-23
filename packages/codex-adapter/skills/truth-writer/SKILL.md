---
name: truth-writer
description: Use when durable findings, completed task reports, or reusable project knowledge should be deposited into a canonical truth corpus.
---

# truth writer

Primary reference:

- `../../references/TRUTH-AGENT-SPEC.md`

## Purpose

Turn reports, code discoveries, or completed task outcomes into durable canonical truth.
In claw-kit projects, the canonical truth corpus lives under `.claw/truth/`.

## Delegation model

This skill is a dedicated deposition worker.
The caller provides a completed task report, investigation report, or equivalent finding bundle.
The writer judges whether the input contains reusable truth, then updates the canonical truth corpus.

## What truth is for

Truth docs are not progress logs or PR summaries. They should help future agents:

- investigate faster
- locate code faster
- understand stable constraints and behavior

## Only write durable knowledge

Prefer writing truth when the material contains:

- stable architecture facts
- durable feature behavior
- important debugging or routing knowledge
- long-lived constraints
- reusable investigation anchors

Skip:

- temporary progress
- one-off status updates
- speculative conclusions
- noisy execution logs

## Routing rules

1. Read existing truth docs first.
2. Prefer updating an existing document when the topic already exists.
3. Create a new truth doc only when the topic is genuinely new.
4. Keep the canonical root inside the project's configured truth corpus; use `.claw/truth/` for claw-kit projects.

## Writing rules

- Bind facts to real code paths whenever possible.
- Distinguish primary code anchors from related files in the prose.
- Do not invent code paths.
- Keep the document readable markdown, not machine-json fragments.
- Update `SUMMARY.md` when the truth set materially changes.
- Write body text in Chinese when the target repository expects Chinese docs, while preserving exact identifiers and paths.
- Treat mojibake strings such as `鐨`, `锛`, and `銆` as corruption; repair or rewrite them before writing canonical truth text.

## Codex workflow

1. Receive a compact completed-work or investigation report.
2. Read the relevant truth docs before writing.
3. Update an existing truth doc when possible.
4. Create a new truth doc only for a genuinely new durable topic.
5. In claw-kit projects, write through `claw truth ingest` when available.

## Output expectation

The delegated truth writer can return a minimal completion payload, but the main agent does not rely on it:

- optional `status`
- optional `updatedPaths`

Returning nothing is also acceptable. Do not send a long write-up back to the main agent.

## Timing rule

Use this skill at task-completion time when:

- a subtask has completed and its task report contains reusable knowledge
- all current plan tasks are done but the plan is not yet closed

Run truth deposition before retrospective closure. Do not defer it to the ADR stage.

## Boundary

Do not use this skill for architecture decisions that deserve an ADR. Those go to `adr-writer`.

Do not default to writing a generic project doc, report, or changelog. The canonical default target is the project's truth corpus.
