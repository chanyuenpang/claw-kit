# OpenClaw ADR Writer Reference

This reference distills the current OpenClaw ADR deposition rules into Codex-facing guidance.

## Mission

Extract durable architecture decisions from plan records and completed work into canonical ADR docs under `.claw/truth/adr/`.

This reference is the complete execution contract for a subagent explicitly delegated as the ADR writer. The main agent supplies the updated completed `plan.json`; the writer extracts durable decisions and performs deposition.

## Input contract

Receive the updated completed `plan.json`, including retrospective and durable `keyDecisions`.

Decision extraction and canonical routing both belong to this writer.

## ADR-worthy decisions

- architecture boundaries and ownership
- data model, storage, queueing, routing, or protocol choices
- integration patterns
- lifecycle or policy decisions with lasting implementation consequences
- long-lived fix patterns that should prevent regressions
- dependency or technology selections with rationale
- accepted tradeoffs with durable consequences

Deposit decisions with lasting implementation consequences, explicit rationale, or durable tradeoffs. Treat supporting status and verification results as evidence for those decisions.

## Source discipline

- completed plans can yield accepted ADRs
- active plans may yield proposed ADRs only when the durable decision is already explicit, including in `keyDecisions`
- use completed tasks as accepted facts and unfinished tasks as contextual evidence

## Output scope

- write or update ADRs under `adr/*.md`
- update `SUMMARY.md` when indexing needs to change
- route generic feature behavior to the truth corpus
- honor the project's configured canonical ADR location; use `.claw/truth/adr/` in claw-kit projects
- use `claw search` to recall candidate ADRs and read the relevant matches
- create a new ADR for a distinct decision
- keep filenames searchable and kebab-case, following the local numbering convention when one exists

## Writer-owned routing

- Use `claw search` as the default router, then read the relevant candidate ADRs.
- For an existing decision, update the best-matching ADR.
- For a new decision, inspect `SUMMARY.md` plus exact filename/title collisions before creating the ADR.
- Update `SUMMARY.md` when discoverability materially changes.
- When search is unavailable or candidates conflict, widen inspection incrementally until routing and duplication are resolved.

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
- summarize the decision and consequences compactly from the completed plan
- ground paths, dates, owners, and alternatives in plan or repository evidence
- repair or rewrite suspicious shell mojibake such as `鐨`, `锛`, or `銆` before canonical deposition

## Execution workflow

1. Extract only durable decisions and their consequences from the completed `plan.json`.
2. Own canonical routing: run `claw search` and read only relevant candidates.
3. Update an existing ADR when the decision already exists.
4. Create a new ADR when the decision is distinct after the bounded duplicate check.
5. Verify the changed target and update the project truth or ADR index when the ADR set materially changed.

## Timing and boundaries

Run ADR deposition after plan completion, using the completed plan as the source bundle. Capture durable architecture, lifecycle, protocol, integration, and workflow decisions with their consequences. Route stable feature behavior and reusable debugging knowledge to truth deposition.

## Return contract

Return a minimal completion payload with optional `status` and `updatedPaths`, or return nothing. Keep the response focused on deposition completion and keep this reference as internal execution guidance.
