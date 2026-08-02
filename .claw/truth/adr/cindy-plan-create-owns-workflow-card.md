# ADR: Cindy plan.create owns workflow-card allocation

## Status

Accepted

## Context

The Cindy adapter projects canonical workflow state into a Ghost progress card.
Creating a new card for `plan.resume` or `plan.done` made one workflow appear as
multiple cards and separated terminal state from its original presentation.

## Decision

- Allocate a workflow card id only when `plan.create` is executed, using the
  originating call id.
- Reuse the session's recorded card id for `plan.resume`, `plan.done`, task
  mutations, and every later projection.
- Keep projection presentation-only: card content is derived from canonical
  plan data and never becomes a second plan store.

## Alternatives considered

- Create cards at lifecycle milestones such as resume and completion. Rejected
  because a single canonical plan would produce duplicate UI artifacts.
- Let every mutation use its own tool-call id. Rejected because no later call
  can reliably identify the original workflow card.

## Consequences

- The user sees one card progress from creation through completion.
- Regression coverage must assert a create → resume → done sequence retains
  the original card id.

## Related code

- `packages/cindy-adapter/plugin/main.js`
- `packages/cindy-adapter/test/plugin-main.test.mjs`
