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
The caller provides the updated completed `plan.json`.
The writer extracts durable decisions, then routes and updates canonical ADRs.

## What counts as ADR-worthy

Write or update an ADR when the work records a lasting decision such as:

- architecture boundaries
- storage model choices
- lifecycle or protocol decisions
- integration patterns
- long-lived workflow rules
- accepted tradeoffs with consequences

Focus ADR deposition on choices with lasting implementation consequences, rationale, or durable tradeoffs. Use status and verification results as supporting evidence.

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

## Workflow

1. Receive the updated completed `plan.json`, including retrospective and durable `keyDecisions`.
2. Own decision extraction and canonical routing: use `claw search` and read only relevant candidate ADRs.
3. Extract only durable decisions and their consequences.
4. Update an existing ADR when the decision already exists.
5. Create a new ADR only when the decision is distinct.
6. Update the project truth or ADR index when the ADR set materially changed.

## Output expectation

The delegated ADR writer can return a minimal completion payload, but the main agent does not rely on it:

- optional `status`
- optional `updatedPaths`

Keep any response focused on completion telemetry.

## Timing rule

Use this skill after completion when:

- the completed plan file is available as the deposition bundle
- the completed work records durable decisions with consequences
- ordinary truth deposition is not the better fit

Run ADR deposition after plan completion.

## Boundary

- Route generic feature behavior to the truth corpus.
- Summarize durable decisions and consequences compactly from the completed plan.
- Keep ADR output focused on architecture, lifecycle, protocol, integration, and workflow decisions.
