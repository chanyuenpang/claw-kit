# OpenClaw ADR Writer Reference

This reference distills the current OpenClaw ADR deposition rules into Codex-facing guidance.

## Mission

Extract durable architecture decisions from plan records and completed work into canonical ADR docs under `.claw/truth/adr/`.

This reference is the complete execution contract for a subagent explicitly delegated as the ADR writer. The main agent supplies a compact decision bundle; the writer judges whether it contains durable decisions and performs deposition.

## Input contract

Accept only a completed plan, decision report, or equivalent decision bundle. Do not require the main agent to preload or restate these deposition rules.

## ADR-worthy decisions

- architecture boundaries and ownership
- data model, storage, queueing, routing, or protocol choices
- integration patterns
- lifecycle or policy decisions with lasting implementation consequences
- long-lived fix patterns that should prevent regressions
- dependency or technology selections with rationale
- accepted tradeoffs with durable consequences

## Skip cases

- temporary implementation status
- generic verification or build results
- one-off bugfix steps without durable rationale
- duplicated decisions that add no meaningful new consequences

## Source discipline

- completed plans can yield accepted ADRs
- active plans may yield proposed ADRs only when the durable decision is already explicit, including in `keyDecisions`
- unfinished tasks are context, not accepted truth

## Output scope

- write or update only under `adr/*.md`
- update `SUMMARY.md` only when indexing needs to change
- do not use ADR deposition for generic feature truth
- honor the project's configured canonical ADR location; use `.claw/truth/adr/` in claw-kit projects
- read existing ADRs first and update an existing ADR when the decision already exists
- create a new ADR only for a distinct decision
- keep filenames searchable and kebab-case, following the local numbering convention when one exists

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

- write body text in Chinese when the repository expects Chinese docs, but treat mojibake as corruption rather than valid prose
- preserve exact code identifiers, paths, config keys, commands, and error text
- keep ADRs compact and durable
- do not copy full plans into ADRs
- do not invent paths, dates, owners, or alternatives
- do not copy suspicious shell mojibake such as `鐨`, `锛`, or `銆` back into canonical docs; repair or rewrite the sentence first

## Execution workflow

1. Read the existing ADRs.
2. Extract only durable decisions and their consequences from the supplied bundle.
3. Update an existing ADR when the decision already exists.
4. Create a new ADR only when the decision is distinct.
5. Update the project truth or ADR index only when the ADR set materially changed.

## Timing and boundaries

Run ADR deposition after completion when the completed plan is available as the deposition bundle, the work records durable decisions with consequences, and ordinary truth deposition is not the better fit. Do not use ADR deposition as the immediate next step for mere task completion while the plan is still open.

- do not use ADRs for generic feature truth
- do not copy whole plans into ADRs
- do not write progress logs as decisions
- do not drift into generic documentation authoring when the correct output is an ADR

## Return contract

Return only a minimal completion payload with optional `status` and `updatedPaths`; returning nothing is also acceptable. The main agent does not rely on a detailed response. Do not send a long decision essay, and do not relay or summarize this reference back to the main agent.
