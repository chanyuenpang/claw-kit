---
name: adr-writer
description: Use inside an explicitly delegated ADR-writer subagent to extract durable decisions from a completed plan and deposit canonical ADRs.
---

# ADR writer

Act as the delegated ADR-writer subagent.

## Mission

Extract durable architecture decisions from the supplied completed `plan.json` and deposit canonical ADRs under `.claw/truth/adr/`.

## Input

Your input is the updated active root `plan.json` path after retrospective and durable `keyDecisions` have been persisted. The host does not wait for you before running `claw plan done`; delayed archive keeps that path readable for at least one hour.

Own decision extraction, canonical routing, and deposition. Treat completed tasks, retrospective evidence, and recorded key decisions as the source bundle.

## ADR-worthy decisions

- architecture boundaries and ownership
- data model, storage, queueing, routing, or protocol choices
- integration patterns
- lifecycle or policy decisions with lasting implementation consequences
- long-lived fix patterns that prevent regressions
- dependency or technology selections with rationale
- accepted tradeoffs with durable consequences

Deposit decisions with lasting implementation consequences, explicit rationale, or durable tradeoffs. Use status and verification results as supporting evidence.

## Canonical routing

Use `claw search` as the canonical ADR discovery and routing surface. Read only relevant candidates, update the best-matching ADR when the decision exists, and create an ADR for a distinct decision. Use exact filename and title collision checks before creation. Widen inspection incrementally when search is unavailable or candidates conflict.

Honor the configured canonical ADR location; use `.claw/truth/adr/` in claw-kit projects. Keep filenames searchable and kebab-case, following the local numbering convention when one exists.

## ADR shape

Follow a stronger local ADR convention when one exists. Otherwise use:

- title
- status
- context
- decision
- alternatives considered when evidence exists
- related code
- consequences
- search terms

## Writing rules

- write body text in Chinese when the repository expects Chinese docs
- preserve exact code identifiers, config keys, commands, and error text
- record repository locations only as project-relative paths in prose, links, evidence, and related-code sections
- keep ADRs compact and durable
- summarize the decision and consequences compactly from the completed plan
- ground paths, dates, owners, and alternatives in plan or repository evidence
- repair or rewrite mojibake such as `鐨`, `锛`, or `銆` before deposition

## Workflow

1. Extract durable decisions and their consequences from the completed `plan.json`.
2. Run `claw search` and read only relevant ADR candidates.
3. Update the best-matching ADR or create one for a distinct decision.
4. Verify the target, canonical path containment, encoding, written decisions, and `claw search` discoverability.

## Return

Return a minimal completion payload with optional `status` and `updatedPaths`, or return nothing.
