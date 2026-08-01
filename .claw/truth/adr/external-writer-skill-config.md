# ADR: External writer skill config

## Status

Accepted

## Context

`claw-kit` runs one consistency-aware knowledge stewardship sequence owned by a finalization job. Projects need one stable configuration surface to select launcher policy and replace the hidden built-in governance assignment without restoring the retired main-agent `delegateSubagents` writer contract.

## Decision

Use one project-level object:

- `knowledgeWriter.executionPolicy`: `background | subagent`, defaulting to `background`. Codex uses it to select the executor launcher. Cindy currently supports only its Orca subagent lifecycle and normalizes either configured value to `subagent`; this is a host capability rule, not a failure fallback. Host-specific orchestration is owned by `hook-owned-two-phase-knowledge-finalization.md`.
- `knowledgeWriter.externalSkills`: ordered external governance skills materialized as sequential assignment tasks. A failed assignment prevents later tasks from starting. An empty or absent list selects the hidden Core built-in governance contract rather than a discoverable skill.
- `knowledgeWriter.model`: `null` uses the host runner default; a value is snapshotted into each finalization job.
- `knowledgeWriter.reasoningEffort`: selects the supported worker effort and defaults to `medium`.
- `knowledgeWriter.datedSectionsToKeep`: a non-negative integer snapshotted into each finalization job; the built-in retention decision and default are owned by `bounded-truth-and-adr-evolution-governance.md`.

Background Stop/session-idle on supporting hosts and subagent terminal mutation both snapshot the effective configuration into `KnowledgeFinalizationJob.writer`. Cindy always takes the terminal-mutation path and snapshots the normalized `subagent` policy. All launchers share the immutable job, assignment builders, claim ownership and done protocol, but not one orchestration shape: Codex uses the internal delegate template and dynamic assignment subplan, while Cindy uses an atomic executor without a plan/subplan.

Built-in and external assignments use distinct prompt builders. The built-in prompt directly supplies the hidden one-owner, Truth → ADR governance contract. An external assignment explicitly invokes its configured skill and adapts it to unattended, non-interactive execution: do not request review or confirmation, use task status to separate completed scope from pending or blocked intent, and skip ambiguous or unsafe writes. Both prompts prohibit references or links to transient supplied materials. External skills own their semantic governance and document structure; the finalizer does not inject the built-in retention or layout contract into them.

Deterministic dated-section governance is built-in automation. The finalizer takes the canonical Markdown snapshot and applies the snapshotted `knowledgeWriter.datedSectionsToKeep` only for the built-in assignment; external skills skip both snapshotting and compaction. The old nested `knowledgeWriter.retention` shape is not supported. Codex internal delegate and its dynamic assignment subplan must complete with status `end.completed`, a non-empty task list, and every task `done`; Cindy atomic execution uses the ordered assignment results as its completion boundary.

Legacy `externalTruthSkill` and `externalAdrSkill` may be normalized only as backward-compatible input. They are not current project schema owners and cannot create separate phase dispatch policies.

## Consequences

- Projects can compose ordered writer capabilities without changing foreground plan workflow; adapters may use distinct launcher orchestration while preserving the shared job protocol.
- External skills use their own governance model without inheriting built-in semantic or retention policy, while the host executor still provides one ordered completion boundary.
- Job snapshots make retries reproducible even if project configuration changes after job creation.
- `model = null` keeps host defaults available; explicit model and reasoning effort are preserved by either launcher.
- Default built-in behavior is one hidden governance assignment that reconciles Truth and ADR together.
- Launcher policy can change executor visibility and timing without forking writer prompts, assignment ordering, claim ownership, or completion semantics.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-01 -->
### Added Cindy subagent without universal plan orchestration

The earlier decision described `subagent` as Codex-only and treated the delegate template plus assignment subplan as universal. Cindy added subagent execution through an atomic no-plan executor, then removed its unreliable errand/background launcher: both configured policy values now resolve to the atomic subagent path. The stable decision remains one configuration and one job/assignment/token protocol, while orchestration is explicitly host-owned.

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
- `packages/core/src/knowledge-assignments.ts`
- `packages/core/resources/delegate-writer/TEMPLATE.json`
- `packages/core/resources/knowledge-writer/`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
