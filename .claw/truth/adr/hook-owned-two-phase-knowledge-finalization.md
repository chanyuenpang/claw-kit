# ADR: Hook-owned two-phase knowledge finalization

## Status

Accepted

## Context

完成计划需要把可信的 `plan.json` 与相邻 turn report 沉淀为可复用 Truth 和 durable ADR，但 foreground plan lifecycle 不能等待 writer，也不能让 main agent 临场决定 writer 路由、模型替换或 canonical 文件位置。Codex 与 OpenCode 还需要使用各自的原生 runner，而 detached worker 不能因自身 Stop/SessionStart hook 再次排队形成递归 finalization。

早期 ADR 把沉淀描述为 main agent 在 `workflowGuidance` closeout 中派发 `truth-writer`、`adr-writer` 并复用线程内 specialist。当前实现已改为 hook-owned sidecar：plan completion 只登记 pending turn owner；下一次 Stop/session-idle 捕获 report、创建 host-aware job，再由 detached worker顺序运行两个 focused writer。

## Decision

- Foreground `claw plan done`、session binding 与 Goal Mode lifecycle 独立于知识采集；hook、report、runner 或 writer 失败一律 fail-open，不回滚 canonical plan state。
- root plan 或 subplan 完成时，knowledge registry 只登记该 completion turn 的 pending owner。下一次 Stop/session-idle 最多追加一份 report，并以 completed plan、相邻 report、finalize id、writer config snapshot 与 hook-native host 创建幂等 job。
- Main agent 不派发 knowledge writers，也不消费 writer 返回文本。Detached finalizer 先运行 focused `truth-writer`，再在同一项目状态上运行 focused `adr-writer`；`keyDecisions` 为空时仅 ADR phase no-op。
- `knowledgeWriter.externalSkill`、`model` 与 `reasoningEffort` 在 job 创建时快照。Codex job 使用版本化 SDK runtime，OpenCode job 使用 `opencode run`；runner 不替换 job 指定的模型或思考强度。
- Writer 线程环境设置 `CLAW_KNOWLEDGE_FINALIZER=1`，使其 Stop/SessionStart hook 在 CLI preflight 前退出；invocation host 的输入验证、job 快照与 worker 路由由 `invocation-host-handling.md` 拥有，finalizer 不产生递归 job。
- 两个 writer 都成功后，worker 依次归一化 `.claw/truth/**/*.md` 编码、请求 completion recall refresh、持久化 `succeeded` job，再 best-effort 清理临时 report。失败 job 保留 report 并按既有上限重试。
- Truth/ADR 的 canonical routing、候选阅读和 one-owner consistency 分别由 focused writer skill 拥有；response format 与自然语言总结不参与控制流。

## Alternatives Considered

- 由 main agent 在 closeout 派发或复用 writer subagent：拒绝，因为会把 finalization 时机、模型合同和完成判断重新交给主线程提示词。
- 在一次 combined writer turn 中同时写 Truth 与 ADR：拒绝，因为事实更新和架构 owner 收敛需要不同输入边界与顺序。
- 仅设置 launch-disable 环境变量跳过 job：拒绝，因为 queued/failed job 会在后续 SessionStart 被重新发现；真正的 no-deposition workflow 应由显式 session scope 或持久化 policy 表达。
- 让 foreground 等待 writer：拒绝，因为 knowledge sidecar 失败不能阻塞 plan lifecycle。

## Consequences

- 完成期沉淀由一个 host-aware job owner 管理，main agent、workflow guidance 和旧 specialist reuse policy 不再形成第二套当前派发合同。
- Truth phase 的产物可供 ADR phase 做一致性判断，同时两类 writer 的职责和可测试边界保持独立。
- Writer 递归 hook 已在进程环境与 CLI preflight 两层被阻断；外层 harness plan 若不应沉淀，仍需要单独的 session-scope lifecycle，而不是依赖 runner guard。
- Job、report、encoding、refresh 和 cleanup 的顺序成为可回归的完成证据。

## Related Code

- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/knowledge-hook-preflight.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/opencode-runner.ts`
- `shared/skills/truth-writer/SKILL.md`
- `shared/skills/adr-writer/SKILL.md`

## Search Terms

- `hook-owned knowledge finalization`
- `two-phase knowledge finalization`
- `pendingTurnOwner`
- `KnowledgeFinalizationJob`
- `CLAW_KNOWLEDGE_FINALIZER`
- `truth-writer`
- `adr-writer`
- `job.host`
- `writer config snapshot`
- `recursive finalization guard`
