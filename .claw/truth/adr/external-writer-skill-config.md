# ADR: External writer skill config

## Status

Accepted

## Context

`claw-kit` separates canonical deposition into sequential `truth-writer` and `adr-writer` phases owned by the background finalization job. Projects still need one stable configuration surface to replace the built-in skill and select worker capability without restoring the retired main-agent `delegateSubagents` dispatch contract.

## Decision

Use one project-level object:

- `knowledgeWriter.externalSkill`: `null` selects the built-in focused skills; a non-null skill id is invoked for both phase-specific prompts.
- `knowledgeWriter.model`: `null` uses the host runner default; a value is snapshotted into each finalization job.
- `knowledgeWriter.reasoningEffort`: selects the supported worker effort and defaults to `medium`.

The Stop/session-idle hook snapshots this effective configuration into `KnowledgeFinalizationJob.writer`. The host-aware finalizer, not `workflowGuidance` or the main agent, applies it independently to the Truth and ADR phases. Each prompt still declares its phase scope, completed plan, adjacent report, and finalization id; claw-kit does not define external document roots or subdirectory structure.

Legacy `externalTruthSkill` and `externalAdrSkill` may be normalized only as backward-compatible input. They are not current project schema owners and cannot create separate phase dispatch policies.

## Consequences

- Projects can replace writer capability without changing foreground plan workflow or creating separate host dispatch rules.
- Job snapshots make retries reproducible even if project configuration changes after Stop.
- `model = null` keeps host defaults available; explicit model and reasoning effort are preserved by the selected runner.
- Default built-in behavior remains the ordered `claw-kit:truth-writer` then `claw-kit:adr-writer` path.

## Related Code

- `.claw/project.json`
- `packages/core/src/types.ts`
- `packages/core/src/init.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/knowledge-sidecar.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`
