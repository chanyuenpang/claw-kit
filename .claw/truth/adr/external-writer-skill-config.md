# ADR: External writer skill config

## Status

Accepted

## Context

`claw-kit` runs one consistency-aware knowledge stewardship pass owned by the background finalization job. Projects still need one stable configuration surface to replace the built-in skill and select worker capability without restoring the retired main-agent `delegateSubagents` dispatch contract.

## Decision

Use one project-level object:

- `knowledgeWriter.externalSkills`: ordered external finalizer skills. Each skill runs in its own host session, in list order; a failed run prevents later skills from starting. An empty or absent list selects the built-in `claw-kit:knowledge-writer`.
- `knowledgeWriter.model`: `null` uses the host runner default; a value is snapshotted into each finalization job.
- `knowledgeWriter.reasoningEffort`: selects the supported worker effort and defaults to `medium`.
- `knowledgeWriter.datedSectionsToKeep`: a non-negative integer snapshotted into each finalization job; the built-in retention decision and default are owned by `bounded-truth-and-adr-evolution-governance.md`.

The Stop/session-idle hook snapshots this effective configuration into `KnowledgeFinalizationJob.writer`. The host-aware finalizer, not `workflowGuidance` or the main agent, dynamically selects and runs every configured skill in order. Every selected governance skill receives the same unattended prompt: organize the supplied materials according to the named skill's governance rules, do not request human review or confirmation, make evidence-based decisions, and skip ambiguous or unsafe writes. The prompt does not require strict execution of the named skill. External skills own their semantic governance and document structure; the finalizer does not inject the built-in one-owner, Truth → ADR, retention, or layout contract.

Deterministic dated-section governance is built-in-writer automation. The finalizer takes the canonical Markdown snapshot and applies the snapshotted `knowledgeWriter.datedSectionsToKeep` only when it selected `claw-kit:knowledge-writer`; external skills skip both snapshotting and compaction. The old nested `knowledgeWriter.retention` shape is not a supported project configuration. Only the built-in writer must complete a session workflow with status `end.completed`, a non-empty task list, and every task `done`; external governance skills have no claw workflow completion requirement.

Legacy `externalTruthSkill` and `externalAdrSkill` may be normalized only as backward-compatible input. They are not current project schema owners and cannot create separate phase dispatch policies.

## Consequences

- Projects can compose ordered writer capabilities without changing foreground plan workflow or creating separate host dispatch rules.
- External skills can use their own governance model without inheriting built-in semantic or retention policy, and can complete without a claw session workflow; an incomplete built-in writer workflow still fails finalization.
- Job snapshots make retries reproducible even if project configuration changes after Stop.
- `model = null` keeps host defaults available; explicit model and reasoning effort are preserved by the selected runner.
- Default built-in behavior is one `claw-kit:knowledge-writer` pass that reconciles Truth and ADR together.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-07-21 -->
### Replaced strict external-skill invocation and universal workflow assertion

External skills were previously invoked with a strict-follow prompt and were subject to the same workflow-completion assertion as the built-in writer. That conflicted with unattended finalization when an external skill's own contract requires interactive confirmation. The finalizer now adopts external governance rules through an explicit unattended adapter prompt, while retaining the session-workflow assertion only for the built-in writer.

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
