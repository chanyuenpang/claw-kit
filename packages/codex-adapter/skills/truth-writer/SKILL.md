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

This skill should normally run as a dedicated deposition subagent.

The main agent should:

1. finish the primary task work
2. take the completed subagent's task report, or an equivalent completed subtask report
3. reuse an existing `truth-writer` worker in the current thread when practical; otherwise dispatch a new one
4. when dispatching a new one, prefer `agent_type: "worker"` with model `gpt-5.4-mini`
5. attach this `claw-kit:truth-writer` skill explicitly in the dispatch bundle
6. do not block the main task lifecycle waiting for a result
7. treat any returned payload as optional telemetry only

The main agent should not spend its primary context budget drafting large truth documents inline unless delegation is unavailable.

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
- Write body text in Chinese while preserving exact identifiers and paths.

## Codex workflow

1. Main agent captures the completed subagent's task report, or an equivalent completed subtask report.
2. Main agent should not expand that input into a larger custom bundle unless the workflow truly lacks a usable task report.
3. Main agent should prefer dispatch when `workflowGuidance.delegateSubagents` contains a `truth-writer` entry.
4. The truth subagent reads the relevant truth docs.
5. The truth subagent updates or creates the canonical truth through `claw truth ingest`.

## Output expectation

The delegated truth writer may return a minimal completion payload, but the main agent should not rely on it:

- optional `status`
- optional `updatedPaths`

Returning nothing is also acceptable. Do not send a long write-up back to the main agent.

## Timing rule

Use this skill at task-completion time when:

- a subtask has completed and its task report may contain reusable knowledge
- all current plan tasks are done but the plan is not yet closed
- `workflowGuidance` says truth deposition should happen before retrospective closure

Do not wait until ADR time if the CLI guidance already points to truth deposition first.

## Boundary

Do not use this skill for architecture decisions that deserve an ADR. Those go to `adr-writer`.

Do not default to writing a generic project doc, report, or changelog. The canonical default target is `.claw/truth/`.
