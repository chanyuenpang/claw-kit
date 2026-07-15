# OpenClaw ADR Writer Reference

This reference distills the current OpenClaw ADR deposition rules into Codex-facing guidance.

## Mission

Extract durable architecture decisions from plan records and completed work into canonical ADR docs under `.claw/truth/adr/`.

## ADR-worthy decisions

- architecture boundaries and ownership
- data model, storage, queueing, routing, or protocol choices
- lifecycle or policy decisions with lasting implementation consequences
- long-lived fix patterns that should prevent regressions
- dependency or technology selections with rationale

Deposit decisions with lasting implementation consequences, explicit rationale, or durable tradeoffs. Treat status and verification results as supporting evidence.

## Source discipline

- completed plans and completed tasks are accepted facts
- active plans may still contain durable decisions in `keyDecisions`
- use completed tasks as accepted facts and unfinished tasks as contextual evidence

## Output scope

- write or update ADRs under `adr/*.md`
- update `SUMMARY.md` when indexing needs to change
- route generic feature behavior to the truth corpus

## Writer-owned routing

- Canonical ADR routing belongs to the writer.
- The input is the updated completed `plan.json`; decision extraction also belongs to the writer.
- Use `claw search` and read only relevant candidate ADRs.
- For a new ADR, check `SUMMARY.md` and exact filename/title collisions before widening the search.
- When search is unavailable or candidates conflict, widen inspection incrementally until routing and duplication are resolved.
- Update `SUMMARY.md` only when discoverability materially changed.

## ADR shape

- title
- status
- context
- decision
- alternatives considered when evidence exists
- related code
- consequences
- search terms

## Writing rules

- write body text in Chinese when the repository expects Chinese docs, but treat mojibake as corruption rather than valid prose
- preserve exact code identifiers, paths, config keys, commands, and error text
- keep ADRs compact and durable
- summarize decisions and consequences compactly from the completed plan
- ground paths, dates, owners, and alternatives in plan or repository evidence
- repair or rewrite suspicious shell mojibake such as `鐨`, `锛`, or `銆` before canonical deposition
