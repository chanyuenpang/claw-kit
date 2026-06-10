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

- `workflowGuidance.delegateSubagents` carries explicit `skill`、`model` 和 `fork_context` 字段
- default built-in skills stay `claw-kit:truth-writer` and `claw-kit:adr-writer`
- external overrides switch routing to bare skill names such as `external-truth-writer` and `external-adr-writer`
- writer deposition 默认使用 `fork_context: false`，只发送窄 bundle，而不是复制整段主线程历史
- claw-kit does not define external document roots or subdirectory structure

## Consequences

- Projects can replace truth and ADR writers without changing the main claw-kit workflow.
- Writer routing stays explicit and machine-readable in `delegateSubagents`.
- writer specialist 默认保持非全量上下文 fork，减少沉淀型 worker 的上下文膨胀和宿主差异影响。
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
