# ADR: External writer skill config

## Status

Accepted

## Context

`claw-kit` runs one consistency-aware knowledge stewardship pass owned by the background finalization job. Projects still need one stable configuration surface to replace the built-in skill and select worker capability without restoring the retired main-agent `delegateSubagents` dispatch contract.

## Decision

Use one project-level object:

- `knowledgeWriter.externalSkill`: `null` selects the built-in `claw-kit:knowledge-writer`; a non-null skill id replaces that combined pass.
- `knowledgeWriter.model`: `null` uses the host runner default; a value is snapshotted into each finalization job.
- `knowledgeWriter.reasoningEffort`: selects the supported worker effort and defaults to `medium`.
- `knowledgeWriter.datedSectionsToKeep`: a non-negative integer snapshotted into each finalization job; the built-in retention decision and default are owned by `bounded-truth-and-adr-evolution-governance.md`.

The Stop/session-idle hook snapshots this effective configuration into `KnowledgeFinalizationJob.writer`. The host-aware finalizer, not `workflowGuidance` or the main agent, dynamically selects the configured skill and sends only its invocation, the completed plan, adjacent report, finalization id, and generic evidence-interpretation boundaries. An external skill owns its own semantic governance and document structure; the finalizer must not inject the built-in one-owner, Truth → ADR, retention, or layout contract.

Deterministic dated-section governance is built-in-writer automation. The finalizer takes the canonical Markdown snapshot and applies the snapshotted `knowledgeWriter.datedSectionsToKeep` only when it selected `claw-kit:knowledge-writer`; external skills skip both snapshotting and compaction. The old nested `knowledgeWriter.retention` shape is not a supported project configuration. Every writer must still complete at least one session workflow with status `end.completed`, a non-empty task list, and every task `done`, but the completion gate must not require the built-in `templateId`.

Legacy `externalTruthSkill` and `externalAdrSkill` may be normalized only as backward-compatible input. They are not current project schema owners and cannot create separate phase dispatch policies.

## Consequences

- Projects can replace writer capability without changing foreground plan workflow or creating separate host dispatch rules.
- External skills can use their own template and governance model without inheriting built-in semantic or retention policy; an incomplete session workflow still fails finalization.
- Job snapshots make retries reproducible even if project configuration changes after Stop.
- `model = null` keeps host defaults available; explicit model and reasoning effort are preserved by the selected runner.
- Default built-in behavior is one `claw-kit:knowledge-writer` pass that reconciles Truth and ADR together.

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
