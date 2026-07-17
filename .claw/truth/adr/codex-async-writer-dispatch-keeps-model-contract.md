# ADR: Codex writer dispatch preserves the workflow model contract

## Status

Accepted

## Context

Root-plan closeout requires durable `keyDecisions` to be handed to the canonical writer asynchronously. The foreground workflow must not wait for writer completion, but dispatch still has to preserve the model and agent identity selected by `workflowGuidance`; silently retrying with another model would make the closeout evidence non-reproducible.

The `0.1.75` acceptance recorded that `truth-writer` was dispatched with `model=gpt-5.6-luna` and `agent_id=019f6e6f-94f9-75c1-b780-250b91bf5cc3`, without model substitution or waiting for completion. The same completed-plan contract requires `adr-writer` to run asynchronously after `retrospective` and `keyDecisions` are persisted.

## Decision

- Root-plan closeout dispatches `truth-writer` and required `adr-writer` asynchronously according to returned `workflowGuidance`.
- Preserve the exact returned writer model and `agent_id`; do not substitute another model and do not block foreground closeout waiting for completion.
- Treat dispatch as the required closeout proof; writer completion is separately observable and is not implied by `claw plan done`.
- When `keyDecisions` is absent or empty, `adr-writer` returns `status: "no-op"` with reason `no durable keyDecisions` and does not scan the ADR corpus.

## Alternatives Considered

- Waiting for writer completion: rejected because it couples foreground plan closeout to asynchronous deposition latency.
- Retrying with another model: rejected because it violates the workflowGuidance model contract and changes the evidence being evaluated.
- Letting the main agent choose canonical ADR files: rejected because ADR routing belongs to the writer after `claw search` recall.

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/skills/adr-writer/SKILL.md`
- `packages/core/src/workflow-guidance.config.json`
- `.claw/tasks/验收-0.1.75-短Bootstrap-20260717T1255/plan.json`

## Consequences

- Foreground completion remains responsive while required ADR dispatch remains auditable.
- Model identity, writer identity, and no-substitution behavior become durable regression checks.
- ADR routing and duplicate detection stay writer-owned and use the canonical `.claw/truth/adr/` surface.

## Search Terms

- `workflowGuidance`
- `adr-writer`
- `truth-writer`
- `waitForCompletion=false`
- `model=gpt-5.6-luna`
- `writer-owned routing`

## 2026-07-17 实测补充

完成计划要求 truth-writer 与 adr-writer 均遵循 workflowGuidance 的 `model=gpt-5.6-luna` 与异步 `waitForCompletion=false` 合同；不以其他模型重试。模型覆盖可用性仍取决于当前父线程 host surface，因此“调度被接受”与“writer 已完成沉淀”必须分开报告。
