---
name: adr-writer
description: Use when durable architecture or workflow decisions from completed work should be deposited into canonical ADR documents.
---

# ADR writer

Primary reference:

- `../../references/ADR-AGENT-SPEC.md`

## Purpose

Capture durable architecture decisions from plans or completed work into canonical ADRs.
In claw-kit projects, canonical ADRs live under `.claw/truth/adr/`.

## Delegation model

This skill is a dedicated decision deposition worker.
The caller provides a completed plan, decision report, or equivalent context bundle.
The writer judges whether the material contains durable decisions, then updates canonical ADRs.

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
- Use the project's canonical ADR location; use `.claw/truth/adr/` for claw-kit projects.
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

1. Receive a completed plan, decision report, or equivalent decision bundle.
2. Read existing ADRs first.
3. Extract only durable decisions and their consequences.
4. Update an existing ADR when the decision already exists.
5. Create a new ADR only when the decision is distinct.
6. Update the project truth or ADR index when the ADR set materially changed.

## Output expectation

The delegated ADR writer can return a minimal completion payload, but the main agent does not rely on it:

- optional `status`
- optional `updatedPaths`

Do not send a long decision essay back to the main agent.

## Timing rule

Use this skill after completion when:

- the completed plan file is available as the deposition bundle
- the completed work records durable decisions with consequences
- ordinary truth deposition is not the better fit

Do not use ADR deposition as the immediate next step for mere task completion while the plan is still open.

## Boundary

- Do not use ADRs for generic feature truth.
- Do not copy whole plans into ADRs.
- Do not write progress logs as decisions.
- Do not drift into generic docs authoring when the correct output is an ADR.
