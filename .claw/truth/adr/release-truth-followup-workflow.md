# ADR: Release truth follow-up workflow

## Status

Accepted

## Context

During the `release-truth-followup-publish` release, `claw plan write` and `appendTasks` had temporarily gained automatic truth follow-up task injection. That made the plan lifecycle heavier than intended and pushed `workflowGuidance` away from its main job: telling the agent what to do next. The release goal was to keep truth deposition as delegated `truth-writer` work while restoring lightweight completion guidance.

## Decision

The release locks in these rules:

- `claw plan write` and `appendTasks` do not auto-insert truth follow-up tasks.
- completion guidance stays lightweight and points to the next task through `nextTask` and `nextStep`.
- reusable truth deposition continues to run through `truth-writer`, not through plan-task injection.
- ADR deposition continues to run through `adr-writer` with the completed `plan.json` as the bundle.

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
