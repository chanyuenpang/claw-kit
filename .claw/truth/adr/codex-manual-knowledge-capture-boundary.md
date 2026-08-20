# ADR: Codex 显式手动知识采集边界

## Context

自动 knowledge finalization 从完成的 claw project plan 取得其 lifecycle、冻结的 writer 配置和受控的 delegate protocol。用户也需要把非 claw 工作中已经建立的结论写入项目 Truth/ADR，但该需要不应让 Agent 推断性启动沉淀，也不能把手动入口混入自动 closeout 的 report、job 或 worker 生命周期。

## Decision

提供一个仅由用户明确请求启动的 Codex `knowledge-capture` skill。该 skill 由发起它的同一 Agent 使用 `claw knowledge prepare --source agent-memory` 读取当前有效配置，按返回 assignment 执行治理，并用配置 fingerprint 调用 `claw knowledge complete`。该路径不得创建或消费 plan、task、subplan、report、knowledge job、background worker、thread 或 collaboration subagent，也不得从 transcript、旧 report 或重新调查中补造证据。

自动 finalization 与其内部 `delegate-writer` / `knowledge-writer` 资源继续保持不可发现；手动 skill 只提供受限的用户入口，不成为自动触发或替代自动 closeout 的第二个 lifecycle owner。

## Alternatives

- 让 Agent 在任务完成时自动建议或调用手动 capture：拒绝，因为会以推断替代用户授权，并与自动 closeout 的 ownership 重叠。
- 复用 plan/report/job/subagent finalizer：拒绝，因为手动路径只需要治理已在当前 Agent memory 中存在的结论，额外 lifecycle 产物会扩大状态和递归风险。
- 公开内部 writer skill：拒绝，因为 writer 的 assignment、token 与 finalization 编排仍由 Core 内部资源拥有。

## Consequences

- 手动沉淀有清晰的授权与证据边界；上下文压缩导致证据不足时必须无编辑退出。
- CLI 在 complete 时检测配置漂移，并只治理 prepare 所声明的 canonical 路径；已有编辑保持可见，调用方可在重新 prepare 后决定是否重试。
- 公开插件 surface、CLI contract 和 focused tests 必须共同维持“显式、同 Agent、无 job/report/subagent”的约束。

## Related code

- `packages/codex-adapter/skills/knowledge-capture/SKILL.md`
- `packages/cli/src/cli.ts`
- `packages/core/src/knowledge-assignments.ts`
- `packages/cli/test/cli-surface.test.ts`
- `scripts/codex-plugin-bundle.test.mjs`
- `../features/codex-manual-knowledge-capture.md`
- `hook-owned-two-phase-knowledge-finalization.md`

## Search terms

- `manual knowledge capture`
- `knowledge prepare`
- `knowledge complete`
- `agent-memory`
- `configFingerprint`
