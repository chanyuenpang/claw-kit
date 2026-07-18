# ADR: Hook-owned consistency-aware knowledge finalization

## Status

Accepted

## Context

完成计划需要把可信的 `plan.json` 与相邻 turn report 沉淀为可复用 Truth 和 durable ADR，但 foreground plan lifecycle 不能等待 writer，也不能让 main agent 临场决定 writer 路由、模型替换或 canonical 文件位置。Codex 与 OpenCode 还需要使用各自的原生 runner，而 detached worker 不能因自身 Stop/SessionStart hook 再次排队形成递归 finalization。

早期 ADR 把沉淀描述为 main agent 在 `workflowGuidance` closeout 中派发 `truth-writer`、`adr-writer` 并复用线程内 specialist。后续 hook-owned sidecar 曾顺序运行两个 focused writer；`0.1.80` 已用一次 consistency-aware `knowledge-writer` pass 取代这个 phase split，使 canonical owner discovery、Truth 更新与 ADR 决策能在同一证据和当前项目状态下统一收敛。

## Decision

- Foreground `claw plan done`、session binding 与 Goal Mode lifecycle 独立于知识采集；hook、report、runner 或 writer 失败一律 fail-open，不回滚 canonical plan state。
- root plan 或 subplan 完成时，knowledge registry 只登记该 completion turn 的 pending owner。下一次 Stop/session-idle 最多追加一份 report，并以 completed plan、相邻 report、finalize id、writer config snapshot 与 hook-native host 创建幂等 job。
- Main agent 不派发 knowledge writer，也不消费 writer 返回文本来决定 canonical routing。Detached finalizer 运行一次 `knowledge-writer` pass；writer 必须同时审查 Truth 与 ADR、维护一个 current owner，并允许 evidence-backed Truth-only、ADR-only、both 或 no-op route。
- `knowledgeWriter.externalSkill`、`model` 与 `reasoningEffort` 在 job 创建时快照。Codex job 使用版本化 SDK runtime，OpenCode job 使用 `opencode run`；runner 不替换 job 指定的模型或思考强度。
- Writer 线程环境设置 `CLAW_KNOWLEDGE_FINALIZER=1`，使其 Stop/SessionStart hook 在 CLI preflight 前退出；内置 skill 的 top-level `scope: "session"` 又让 writer 自身 claw harness 存在于用户级 session runtime，不触发项目 knowledge capture。invocation host 的输入验证、job 快照与 worker 路由由 `invocation-host-handling.md` 拥有。
- Combined writer 成功后，worker 依次归一化 `.claw/truth/**/*.md` 编码、请求 completion recall refresh、持久化 `succeeded` job，再 best-effort 清理临时 report。失败 job 保留 report 并按既有上限重试。
- `knowledge-writer` 统一拥有 canonical routing、候选阅读、freshness qualification 与 one-owner consistency；response format 与自然语言总结不参与控制流。

## Alternatives Considered

- 由 main agent 在 closeout 派发或复用 writer subagent：拒绝，因为会把 finalization 时机、模型合同和完成判断重新交给主线程提示词。
- 顺序运行 focused `truth-writer` 与 `adr-writer`：已取代。phase split 会让第二个 writer 重新发现候选与解释第一阶段输出，并可能留下跨 Truth/ADR 的竞争 current claim；combined stewardship pass 以同一份 freshness-qualified evidence 一次完成 owner reconciliation。
- 仅设置 launch-disable 环境变量跳过 job：拒绝，因为 queued/failed job 会在后续 SessionStart 被重新发现；真正的 no-deposition workflow 应由显式 session scope 或持久化 policy 表达。
- 让 foreground 等待 writer：拒绝，因为 knowledge sidecar 失败不能阻塞 plan lifecycle。

## Consequences

- 完成期沉淀由一个 host-aware job owner 管理，main agent、workflow guidance 和旧 specialist reuse policy 不再形成第二套当前派发合同。
- Truth 与 ADR 被作为一个 knowledge system 审查，material fact 或 decision 不再由两个独立 writer 各自声明 owner。
- Writer 递归 hook 已在进程环境与 CLI preflight 两层被阻断；外层 harness plan 若不应沉淀，仍需要单独的 session-scope lifecycle，而不是依赖 runner guard。
- Job、report、encoding、refresh 和 cleanup 的顺序成为可回归的完成证据。
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
