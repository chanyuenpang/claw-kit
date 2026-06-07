# ADR: External writer skill config

## Status

Accepted

## Context

`claw-kit` already separates canonical deposition into `truth-writer` and `adr-writer`.
Projects still need a way to replace those built-in writers without forcing claw-kit to own external document roots or routing rules.

## Decision

Use only two explicit project-level override fields:

- `externalTruthSkill`
- `externalAdrSkill`

Keep writer routing minimal:

- `workflowGuidance.delegateSubagents` carries explicit `skill` and `model` fields
- default built-in skills stay `claw-kit:truth-writer` and `claw-kit:adr-writer`
- external overrides switch routing to bare skill names such as `external-truth-writer` and `external-adr-writer`
- claw-kit does not define external document roots or subdirectory structure

## Consequences

- Projects can replace truth and ADR writers without changing the main claw-kit workflow.
- Writer routing stays explicit and machine-readable in `delegateSubagents`.
- Default built-in writer behavior still works unchanged when no external override is configured.

## Related Code

- `.claw/project.json`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
