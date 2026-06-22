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

## Skip cases

- temporary implementation status
- generic verification or build results
- one-off bugfix steps without durable rationale
- duplicated decisions that add no meaningful new consequences

## Source discipline

- completed plans and completed tasks are accepted facts
- active plans may still contain durable decisions in `keyDecisions`
- unfinished tasks are context, not accepted truth

## Output scope

- write or update only under `adr/*.md`
- update `SUMMARY.md` only when indexing needs to change
- do not use ADR deposition for generic feature truth

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
- do not copy full plans into ADRs
- do not invent paths, dates, owners, or alternatives
- do not copy suspicious shell mojibake such as `鐨`, `锛`, or `銆` back into canonical docs; repair or rewrite the sentence first
