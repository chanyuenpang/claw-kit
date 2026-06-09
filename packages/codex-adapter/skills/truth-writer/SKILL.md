---
name: truth-writer
description: Use when a completed subtask report should be deposited into canonical .claw truth.
---

# claw-kit truth writer

This skill ports OpenClaw's truth-agent behavior into Codex.

Primary reference:

- `../../references/TRUTH-AGENT-SPEC.md`

## Purpose

Turn reports, code discoveries, or completed task outcomes into durable canonical truth under `.claw/truth/`.

## Delegation model

This skill runs as a dedicated deposition subagent.

The main agent must:

1. finish the primary task work
2. take the completed subagent's task report, or an equivalent completed subtask report
3. reuse an existing `truth-writer` worker in the current thread when it still fits the same role
4. dispatch a new `truth-writer` worker when no suitable same-type specialist is already active
5. use `agent_type: "worker"` with model `gpt-5.4-mini` for a new writer
6. attach this `claw-kit:truth-writer` skill explicitly in the dispatch bundle
7. do not block the main task lifecycle waiting for a result
8. treat any returned payload as optional telemetry only

The main agent does not spend its primary context budget drafting large truth documents inline.
Canonical truth updates run through `truth-writer`, not a main-agent inline shortcut.

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
4. Keep the canonical root inside `.claw/truth/`.

## Writing rules

- Bind facts to real code paths whenever possible.
- Distinguish primary code anchors from related files in the prose.
- Do not invent code paths.
- Keep the document readable markdown, not machine-json fragments.
- Update `SUMMARY.md` when the truth set materially changes.
- Write body text in Chinese when the target repository expects Chinese docs, while preserving exact identifiers and paths.
- Treat mojibake strings such as `鐨`, `锛`, and `銆` as corruption; repair or rewrite them before writing canonical truth text.

## Codex workflow

1. Main agent captures the completed subagent's task report, or an equivalent completed subtask report.
2. Main agent does not expand that input into a larger custom bundle unless the workflow truly lacks a usable task report.
3. Main agent reads `workflowGuidance.delegateSubagents`, uses `tool_search` to locate the current session's agent-management tools, and dispatches `truth-writer`.
4. The truth subagent reads the relevant truth docs.
5. The truth subagent updates or creates the canonical truth through `claw truth ingest`.

## Output expectation

The delegated truth writer can return a minimal completion payload, but the main agent does not rely on it:

- optional `status`
- optional `updatedPaths`

Returning nothing is also acceptable. Do not send a long write-up back to the main agent.

## Timing rule

Use this skill at task-completion time in this order:

- a subtask has completed and its task report contains reusable knowledge
- all current plan tasks are done but the plan is not yet closed
- `workflowGuidance` says truth deposition should happen before retrospective closure

Run truth deposition before retrospective closure. Do not defer it to the ADR stage.

## Boundary

Do not use this skill for architecture decisions that deserve an ADR. Those go to `adr-writer`.

Do not default to writing a generic project doc, report, or changelog. The canonical default target is `.claw/truth/`.
