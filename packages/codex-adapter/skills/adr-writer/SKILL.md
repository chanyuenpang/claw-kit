---
name: adr-writer
description: Use when a completed .claw plan should be deposited into canonical ADR documents.
---

# claw-kit ADR writer

This skill ports OpenClaw's ADR-agent behavior into Codex.

Primary reference:

- `../../references/ADR-AGENT-SPEC.md`

## Purpose

Capture durable architecture decisions from plans or completed work into canonical ADRs under `.claw/truth/adr/`.

## Delegation model

This skill runs as a dedicated ADR deposition subagent.

The main agent must:

1. identify the completed plan to deposit
2. pass the completed plan file as the deposition bundle
3. reuse an existing `adr-writer` worker in the current thread when it still fits the same role
4. dispatch a new `adr-writer` worker when no suitable same-type specialist is already active
5. use `agent_type: "worker"` with model `gpt-5.4-mini` for a new writer
6. attach this `claw-kit:adr-writer` skill explicitly in the dispatch bundle
7. do not block the main task lifecycle waiting for a result
8. treat any returned payload as optional telemetry only

This keeps the main agent focused on primary execution and coordination.
Canonical ADR updates run through `adr-writer`, not a main-agent inline shortcut.

## What counts as ADR-worthy

Write or update an ADR when the work records a lasting decision such as:

- architecture boundaries
- storage model choices
- lifecycle or protocol decisions
- integration patterns
- long-lived workflow rules
- accepted tradeoffs with consequences

Do not write an ADR for:

- temporary implementation status
- isolated bugfix steps
- duplicated decisions already captured without meaningful new consequences

## Source of truth

The plan and its durable decisions are the source:

- completed plans can yield accepted ADRs
- active plans yield proposed ADRs when the decision is already explicit and durable

## ADR rules

- Update an existing ADR when the decision already exists.
- Create a new ADR only for a distinct decision.
- Keep filenames in searchable kebab-case.
- Follow the local numbering convention when the repository already uses one.
- Write body text in Chinese when the target repository expects Chinese docs, while preserving exact identifiers and paths.
- Treat mojibake strings such as `鐨`, `锛`, and `銆` as corruption; repair or rewrite them before writing canonical ADR text.

## ADR shape

Unless the repository already uses a stronger local convention, keep ADRs compact and readable:

- title
- status
- context
- decision
- consequences
- related code

## Codex workflow

1. Main agent passes the completed `plan.json`.
2. The ADR subagent reads existing ADRs first.
3. The ADR subagent reads durable decisions and retrospective context from the completed plan itself.
4. The ADR subagent updates an existing ADR when the decision already exists and creates a new ADR when the decision is distinct.
5. The ADR subagent updates `SUMMARY.md` when the ADR set materially changed.

## Output expectation

The delegated ADR writer can return a minimal completion payload, but the main agent does not rely on it:

- optional `status`
- optional `updatedPaths`

Do not send a long decision essay back to the main agent.

## Timing rule

Use this skill after plan completion in this order:

- `claw plan done` or `claw plan edit --plan-status end.completed` has already succeeded
- `workflowGuidance.delegateSubagents` has been read
- `tool_search` has located the current session's agent-management tools
- the completed plan file is available as the deposition bundle

Do not use ADR deposition as the immediate next step for mere task completion while the plan is still open.

## Boundary

- Do not use ADRs for generic feature truth.
- Do not copy whole plans into ADRs.
- Do not write progress logs as decisions.
- Do not drift into generic docs authoring when the correct output is an ADR.
