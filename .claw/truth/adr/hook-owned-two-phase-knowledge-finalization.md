# ADR: Hook-owned consistency-aware knowledge finalization

## Status

Accepted

## Context

计划进入 `end.*` 后需要把可信的 `plan.json` 与相邻 turn report 沉淀为可复用 Truth 和 durable ADR，但 foreground plan lifecycle 不能等待 writer，也不能让 main agent 临场决定 writer 路由、模型替换或 canonical 文件位置。Codex 与 OpenCode 还需要使用各自的原生 runner，而 detached worker 不能因自身 Stop/SessionStart hook 再次排队形成递归 finalization。

早期 ADR 把沉淀描述为 main agent 在 `workflowGuidance` closeout 中派发 `truth-writer`、`adr-writer` 并复用线程内 specialist。后续 hook-owned sidecar 曾顺序运行两个 focused writer；`0.1.80` 已用一次 consistency-aware `knowledge-writer` pass 取代这个 phase split，使 canonical owner discovery、Truth 更新与 ADR 决策能在同一证据和当前项目状态下统一收敛。

## Decision

- Foreground `claw plan done`、session binding 与 Goal Mode lifecycle 独立于知识采集；hook、report、runner 或 writer 失败一律 fail-open，不回滚 canonical plan state。
- Knowledge finalization 的 lifecycle trigger 属于所有从非终态进入 `end.*` 的转换：`end.completed`、`end.closed` 与 `end.leave` 都登记一次 finalization；`process.active`、`process.wait` 与 `process.discussing` 只累计 report，不登记或启动沉淀。`packages/core/src/plan.ts` 以 `enteredEndState` 识别该边界，并为 sidecar 提供独立 `endedAt`；`end.completed` 专属的 completion hooks 仍只拥有 completion event、subplan resume 与 `completedAt` 等完成语义。
- root plan 或 subplan 进入任一 `end.*` 时，knowledge registry 只登记该 finalization turn 的 pending owner。下一次 Stop/session-idle 最多追加一份 report，并以 source plan、相邻 report、finalize id、writer config snapshot 与 hook-native host 创建幂等 job。
- Main agent 不派发 knowledge writer，也不消费 writer 返回文本来决定 canonical deposition。Detached finalizer 运行一次 `knowledge-writer` pass；writer 以相邻 report 的结论以及 plan 的 retrospective、`keyDecisions` 和其他明确结论字段为证据，task status 只用于解释 completed、pending 与 blocked scope，task 标题、描述、requirements 和 intentions 不是执行记录或结果证明。writer 固定先维护 Truth、再从同一证据和更新后的 Truth 状态维护 ADR，并在最后收敛一个 current owner；没有 durable conclusion、freshness 冲突或知识未变化时可以 evidence-backed no-edit，但不通过 route choice 表达。
- `knowledgeWriter.externalSkill`、`model` 与 `reasoningEffort` 在 job 创建时快照。Codex job 使用版本化 SDK runtime，OpenCode job 使用 `opencode run`；runner 不替换 job 指定的模型或思考强度。
- Writer 线程环境设置 `CLAW_KNOWLEDGE_FINALIZER=1`，使其 Stop/SessionStart hook 在 CLI preflight 前退出；内置 skill 的 top-level `scope: "session"` 又让 writer 自身 claw harness 存在于用户级 session runtime，不触发项目 knowledge capture。invocation host 的输入验证、job 快照与 worker 路由由 `invocation-host-handling.md` 拥有。
- Combined writer 成功后，worker 依次归一化 `.claw/truth/**/*.md` 编码、请求 completion recall refresh、向相邻 report 追加一条以 `finalizeId` 幂等去重的 `knowledge_finalization` JSONL 结果，最后持久化 `succeeded` job。writer、编码、refresh 或结果写回失败都进入既有重试路径；重复尝试不得伪造或追加第二条成功结果。
- Finalizer 不再主动删除 report。report 与 source plan 同属 task directory，归档时一起移动到 `.claw/archive/tasks/`，仅在 task retention 超过 `maxTasksToKeep` 并裁剪整个 archived task 时删除。新项目与缺失配置统一使用共享默认值 `9`；通用 task layout 与 retention 事实由 `../features/task-layout-and-session-bindings.md` 记录。
- `knowledge-writer` 统一拥有 conclusion-evidence qualification、Truth→ADR 固定顺序、候选阅读、freshness qualification 与 one-owner consistency；response format 与自然语言总结不参与控制流。

## Alternatives Considered

- 由 main agent 在 closeout 派发或复用 writer subagent：拒绝，因为会把 finalization 时机、模型合同和完成判断重新交给主线程提示词。
- 顺序运行 focused `truth-writer` 与 `adr-writer`：已取代。phase split 会让第二个 writer 重新发现候选与解释第一阶段输出，并可能留下跨 Truth/ADR 的竞争 current claim；combined stewardship pass 以同一份 freshness-qualified evidence 一次完成 owner reconciliation。
- 在 combined writer 内先选择 Truth-only、ADR-only、both 或 no-op route：拒绝。route task 会把本应固定执行的两个知识面变成额外控制流；当前流程始终先评估 Truth、再评估 ADR，每一阶段自行记录 evidence-backed no-edit。
- 仅设置 launch-disable 环境变量跳过 job：拒绝，因为 queued/failed job 会在后续 SessionStart 被重新发现；真正的 no-deposition workflow 应由显式 session scope 或持久化 policy 表达。
- 让 foreground 等待 writer：拒绝，因为 knowledge sidecar 失败不能阻塞 plan lifecycle。
- finalization 成功后主动删除 report：拒绝，因为这会丢失原始 turn 结论和 writer 的结构化完成结果，使异步 closeout 难以观察；report 应遵循已有 task archive/retention lifecycle。

## Consequences

- 完成期沉淀由一个 host-aware job owner 管理，main agent、workflow guidance 和旧 specialist reuse policy 不再形成第二套当前派发合同。
- Truth 与 ADR 被作为一个 knowledge system 审查，material fact 或 decision 不再由两个独立 writer 各自声明 owner。
- Report 结论与 plan 的明确结论字段成为沉淀证据；task status 只限定这些结论的适用 scope，不再把 task 列表本身当作执行事实。
- 进入任一 `end.*` 才形成自动沉淀边界；process 状态中的 report 与 plan 明确结论可供后续终结评估，但不会单独触发 partial finalization。
- Writer 递归 hook 已在进程环境与 CLI preflight 两层被阻断；外层 harness plan 若不应沉淀，仍需要单独的 session-scope lifecycle，而不是依赖 runner guard。
- Job、report result、encoding、refresh 和持久化顺序成为可回归的完成证据；相邻 report 同时保留原始 turn 结论与可按 `finalizeId` 读取的 writer 结果。
- OpenCode host 的 finalizer agent 入口收敛为单一 `packages/opencode-adapter/agents/claw-knowledge-writer.md`。该 `mode: primary` agent 由 host-aware finalizer 经 `opencode run` 直接启动（不是 main-agent subagent dispatch，因此与 `claw-researcher` 的 `mode: subagent` 形态不同），只加载 combined `claw-kit:knowledge-writer` skill，显式不加载 `using-claw-kit`（writer 自身的 session-scoped template 即自包含 claw harness），也不派发另一个 writer 或拆分 pass；host-aware finalizer 要求该 writer 的 session-scoped plan 到达 `end.completed` 且全部 template tasks 为 `done` 才视为成功。retired `claw-truth-writer.md` 与 `claw-adr-writer.md` agent 不再随 OpenCode adapter 发布，对应 discovery 目录由 `installOpencodePlugin` 在安装期移除。

## Related Code

- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/knowledge-hook-preflight.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/opencode-runner.ts`
- `packages/opencode-adapter/agents/claw-knowledge-writer.md`
- `shared/skills/knowledge-writer/`
- `packages/codex-adapter/skills/knowledge-writer/`

## Search Terms

- `hook-owned knowledge finalization`
- `consistency-aware knowledge finalization`
- `pendingTurnOwner`
- `KnowledgeFinalizationJob`
- `CLAW_KNOWLEDGE_FINALIZER`
- `knowledge-writer`
- `scope: session`
- `job.host`
- `writer config snapshot`
- `recursive finalization guard`
- `claw-knowledge-writer.md`
- `claw-kit:knowledge-writer`
- `end.completed`
