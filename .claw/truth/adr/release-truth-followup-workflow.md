# ADR: Release truth follow-up workflow

## Status

Accepted

## Context

During the `release-truth-followup-publish` release, `claw plan write` and `appendTasks` had temporarily gained automatic truth follow-up task injection. That made the plan lifecycle heavier than intended and pushed `workflowGuidance` away from its main job: telling the agent what to do next. The durable rule is to keep knowledge deposition out of plan-task injection; current writer routing is owned by `hook-owned-two-phase-knowledge-finalization.md`.

## Decision

The release locks in these rules:

- `claw plan write` and `appendTasks` do not auto-insert truth follow-up tasks.
- completion guidance stays lightweight and points to the next task through `nextTask` and `nextStep`.
- reusable Truth and ADR deposition does not run through plan-task injection or main-agent guidance; the hook-owned finalizer supplies the completed plan and report to its two focused phases.

## Consequences

- plans stay smaller and easier to read
- `workflowGuidance` remains focused on the next action contract
- truth deposition remains clearly owned by delegated specialists
- version `0.1.11` and plugin `0.1.11+codex.20260608014500` were released with this contract

## Related code

- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/cli/src/cli.ts`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`

## Search Terms

- `release-truth-followup-publish`
- `appendTasks`
- `truth-writer`
- `adr-writer`
- `workflowGuidance`
