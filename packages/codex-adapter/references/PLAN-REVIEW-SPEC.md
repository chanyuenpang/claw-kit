# OpenClaw Plan Review Reference

This reference distills the current `OpenClaw-dev` `PLAN-REVIEW-SPEC.md` into the Codex adapter.

## Mission

Review plan quality before a plan leaves `prepare.requirements` and enters execution.

## Inputs

- full plan JSON
- workflow definitions
- whether the plan is a subplan

## Workflow routing

- infer the best workflow from `goal.text`
- use `engineering` as the default when the match is weak

## Scoring dimensions

- `atomicity` out of 30
- `stage_completeness` out of 30
- `workflow_match` out of 20
- `completion_clarity` out of 20

## Acceptance guidance

- `50+`: acceptable plan, maybe minor suggestions
- `30-49`: reject and require revision
- `<30`: fundamentally flawed, require restructuring

Simple 1-2 task plans should be judged leniently. Larger plans should show clearer decomposition and workflow coverage.

## Actionable feedback rule

Any returned issue or suggestion is actionable feedback. In OpenClaw semantics, actionable feedback means the plan must not proceed directly into `process.*`; it enters internal `prepare.review` first.

## Output shape

Return structured review data with:

- `score`
- `matchedWorkflow`
- `dimensions`
- `issues`
- `suggestions`
- `completionPolicy`

## Codex adapter interpretation

- treat `prepare.requirements -> process.*` as the only review gate
- never run the same gate again for `prepare.review -> process.*`
- root plans should usually require user confirmation before final completion
- subplans may be auto-completable when their tasks are done
