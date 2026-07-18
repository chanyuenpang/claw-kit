# ADR: Codex subagent reuse policy

## Status

Superseded

Superseded by `hook-owned-two-phase-knowledge-finalization.md`. Knowledge writers now run as fresh host-aware finalizer phases and are not main-thread reusable specialists.

## Context

Codex 适配器会把完成期知识沉淀委派给 specialist。对 `truth-writer` 和 `adr-writer` 而言，每次都新建并在派发后立即关闭 worker，会带来不必要的上下文抖动，也削弱线程内同类沉淀工作的连续性。能复用现有合适的同类型 subagent 时，应优先复用。

## Decision

优先在当前 Codex 线程内复用已有的同类型 specialist，而不是先新建：

- `truth-writer` 和 `adr-writer` 在角色仍然匹配时优先复用
- 只有在线程内没有合适 specialist，或现有 specialist 已明显偏离角色时，才新建实例
- 这两类 specialist 在派发后不阻塞主流程，也不要求自动关闭

## Consequences

- 完成期沉淀可以复用已有上下文，减少重复启动成本
- 主 agent 继续把注意力放在主要执行和协调上，而不是等待非阻塞 specialist 往返
- specialist 复用被限定为执行策略，不改变 `.claw` 计划语义和 bundle 契约

## Related Code

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/references/codex-subagent-dispatch.md`
- `packages/codex-adapter/references/TRUTH-AGENT-SPEC.md`
- `packages/codex-adapter/references/ADR-AGENT-SPEC.md`

## Search Terms

- `truth-writer`
- `adr-writer`
- `reuse`
- `specialist`
- `non-blocking`
