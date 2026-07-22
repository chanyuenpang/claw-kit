# ADR: Hook-owned consistency-aware knowledge finalization

## Context

计划进入 `end.*` 后需要把可信的 `plan.json` 与相邻 turn report 沉淀为可复用 Truth 和 durable ADR，但 foreground plan lifecycle 不能等待 writer，也不能让 main agent 临场决定 writer 路由、模型替换或 canonical 文件位置。Codex 与 OpenCode 还需要使用各自的原生 runner，而 detached worker 不能因自身 Stop/SessionStart hook 再次排队形成递归 finalization。

早期 ADR 把沉淀描述为 main agent 在 `workflowGuidance` closeout 中派发 `truth-writer`、`adr-writer` 并复用线程内 specialist。后续 hook-owned sidecar 曾顺序运行两个 focused writer；`0.1.80` 已用一次 consistency-aware `knowledge-writer` pass 取代这个 phase split，使 canonical owner discovery、Truth 更新与 ADR 决策能在同一证据和当前项目状态下统一收敛。

## Decision

- Foreground `claw plan done`、session binding 与 Goal Mode lifecycle 独立于知识采集；hook、report、runner 或 writer 失败一律 fail-open，不回滚 canonical plan state。
- Knowledge finalization 的 lifecycle trigger 属于所有从非终态进入 `end.*` 的转换：`end.completed`、`end.closed` 与 `end.leave` 都登记一次 finalization；`process.active`、`process.wait` 与 `process.discussing` 只累计 report，不登记或启动沉淀。`packages/core/src/plan.ts` 以 `enteredEndState` 识别该边界，并为 sidecar 提供独立 `endedAt`；`end.completed` 专属的 completion hooks 仍只拥有 completion event、subplan resume 与 `completedAt` 等完成语义。
- root plan 或 subplan 进入任一 `end.*` 时，knowledge registry 只登记该 finalization turn 的 pending owner。下一次 Stop/session-idle 最多追加一份 report，并以 source plan、相邻 report、finalize id、writer config snapshot 与 hook-native host 创建幂等 job。
- Codex 的 task conclusion capture 直接复用成功 `task.done` response 已有的 `ok: true` 与 `command: "task.done"`，不增加专用 marker，也不依赖 mutation、host-action、plan 或 task identity。每次 Stop 只读取其所属 turn 的完整 transcript 记录，把该轮每个成功返回绑定到最近的前置 assistant conclusion，再追加到 registry 当前拥有的相邻 report；没有可靠成功返回或结论时不制造 summary。
- Main agent 不派发 knowledge writer，也不消费 writer 返回文本来决定 canonical deposition。Detached finalizer 动态运行 job 配置的 writer skill；未配置 external skill 时运行内置 `claw-kit:knowledge-writer`。source `plan.json`、相邻 report 与 finalize id 是 finalizer 当前提供的具体 runtime materials，不是内置 writer 的输入 schema；内置 writer 按内容解释所有提供的材料，并以六个 guidance-backed 阶段分离结论提取、证据新鲜度判断、owner 搜索、Truth 维护、ADR 维护和跨文档一致性审查。该 pass 固定先维护 Truth、再维护 ADR 并收敛一个 current owner；external skill 的语义治理由 `external-writer-skill-config.md` 唯一拥有，不由 finalizer 注入。
- Keep the built-in `knowledge-writer` explicit-invocation only. The host-aware finalizer owns the automatic closeout trigger and explicitly invokes the skill with supplied materials; an interactive caller must likewise name the skill and materials. Do not let ordinary skill matching, foreground `using-claw-kit`, or reusable-knowledge heuristics start it implicitly. The generic thin-entry/template-ownership and storage-scope decisions remain owned by `create-claw-skill-entry-route-and-fallback.md`; shared-package materialization remains owned by `shared-planning-skill-source.md`.
- `knowledgeWriter.externalSkills`、`model`、`reasoningEffort` 与 `datedSectionsToKeep` 在 job 创建时快照。finalizer 按 `externalSkills` 顺序运行独立 writer session；列表缺失或为空时使用内置 writer。内置和外部 writer 都收到同一无人值守治理 prompt；外部 skill 依其自身治理规则处理材料而不要求严格执行交互式 skill 合同，内置 writer 仍遵循其严格合同。Codex job 使用版本化 SDK runtime，OpenCode job 使用 `opencode run`；runner 不替换 job 指定的模型或思考强度，内置 writer 的 dated-section governance 使用同一 job snapshot。
- Writer 线程环境设置 `CLAW_KNOWLEDGE_FINALIZER=1`，使其 Stop/SessionStart hook 在 CLI preflight 前退出；内置 skill 的 top-level `scope: "session"` 又让 writer 自身 claw harness 存在于用户级 session runtime，不触发项目 knowledge capture。invocation host 的输入验证、job 快照与 worker 路由由 `invocation-host-handling.md` 拥有。
- 内置 writer 成功后，worker 对该 pass 改动的 canonical Markdown 执行 dated-section governance 并记录裁剪结果；external skill 跳过治理快照与 dated compaction。两条路径随后都依次归一化 `.claw/truth/**/*.md` 编码、请求 completion recall refresh、向相邻 report追加一条以 `finalizeId` 幂等去重的 `knowledge_finalization` JSONL 结果，最后持久化 `succeeded` job。writer、适用的 governance、编码、refresh 或结果写回失败都进入既有重试路径；重复尝试不得伪造或追加第二条成功结果。Governance 的语义与取舍由 `bounded-truth-and-adr-evolution-governance.md` 拥有。
- `succeeded` result 与 job 持久化后，finalizer 不调用 Git。Truth/ADR 写入与治理、成功记录和 index refresh 完成后，canonical 文档改动留在工作区，由正常开发流程审阅和提交。
- Finalizer 不再主动删除 report。report 与 source plan 同属 task directory，归档时一起移动到 `.claw/archive/tasks/`，仅在 task retention 超过 `maxTasksToKeep` 并裁剪整个 archived task 时删除。新项目与缺失配置统一使用共享默认值 `9`；通用 task layout 与 retention 事实由 `../features/task-layout-and-session-bindings.md` 记录。
- 内置 `knowledge-writer` 统一拥有 conclusion-evidence qualification、Truth→ADR 固定顺序、候选阅读、freshness qualification 与 one-owner consistency；response format 与自然语言总结不参与控制流。host session completion 断言只适用于内置 writer：它检查存在 `end.completed`、tasks 非空且全部 `done` 的 session workflow；外部治理 skill 不受该断言约束。

## Alternatives Considered

- 由 main agent 在 closeout 派发或复用 writer subagent：拒绝，因为会把 finalization 时机、模型合同和完成判断重新交给主线程提示词。
- 顺序运行 focused `truth-writer` 与 `adr-writer`：已取代。phase split 会让第二个 writer 重新发现候选与解释第一阶段输出，并可能留下跨 Truth/ADR 的竞争 current claim；combined stewardship pass 以同一份 freshness-qualified evidence 一次完成 owner reconciliation。
- 在 combined writer 内先选择 Truth-only、ADR-only、both 或 no-op route：拒绝。route task 会把本应固定执行的两个知识面变成额外控制流；当前流程始终先评估 Truth、再评估 ADR，每一阶段自行记录 evidence-backed no-edit。
- 让 built-in writer 依靠通用 skill discovery 或“可能产生可复用知识”的前台启发式自动触发：拒绝，因为这会在 hook-owned finalizer 之外形成第二个 invocation owner，并可能重复沉淀、提前沉淀或递归进入 writer harness。
- 仅设置 launch-disable 环境变量跳过 job：拒绝，因为 queued/failed job 会在后续 SessionStart 被重新发现；真正的 no-deposition workflow 应由显式 session scope 或持久化 policy 表达。
- 让 foreground 等待 writer：拒绝，因为 knowledge sidecar 失败不能阻塞 plan lifecycle。
- finalization 成功后主动删除 report：拒绝，因为这会丢失原始 turn 结论和 writer 的结构化完成结果，使异步 closeout 难以观察；report 应遵循已有 task archive/retention lifecycle。
- 增加专用 marker，或以 mutation、host-action、plan、task identity 作为 conclusion checkpoint：拒绝，因为 writer 只消费符合规则的信息，成功 `task.done` response 的既有字段已经足够识别 direct / deferred tool output；额外身份只增加协议和维护成本。

<!-- state: history -->
## Evolution history

<!-- dated: 2026-07-22 -->
### 移除 finalizer 自动 Git 提交

- 先前决策把一次隔离的 fail-open Git commit 作为 successful finalization 的后置副作用，并以 `autoCommitKnowledge` 作为项目配置 gate。该机制已完全移除：finalizer 只写入、治理、记录结果和刷新索引，文档提交由正常开发流程负责。

<!-- dated: 2026-07-21 -->
### External governance skills became unattended-adapter runs

The earlier completion gate applied to every writer session and the invocation instructed each selected skill to be followed exactly. The current finalizer keeps the built-in writer's strict workflow contract, but adapts external skills to unattended governance so their interactive gates are not treated as fulfilled by the runner itself.

<!-- state: current -->
## Consequences

- 完成期沉淀由一个 host-aware job owner 管理，main agent、workflow guidance 和旧 specialist reuse policy 不再形成第二套当前派发合同。
- Automatic closeout 与 skill invocation 的 ownership 保持一致：finalizer 明确启动 writer，而普通交互任务不会因为 description 匹配而自行进入沉淀。writer harness 的 session isolation 继续生效，但其 storage contract 不由本 ADR 重复定义。
- 内置 writer 把 Truth 与 ADR 作为一个 knowledge system 审查，material fact 或 decision 不再由两个独立 writer 各自声明 owner；external skill 的语义合同不由本 ADR规定。
- 内置 writer 从所有提供材料中按内容提取明确结论；finalizer 当前传入的 report 与 plan 只是该通用合同的具体实例。task status 只限定这些结论的适用 scope，不再把 task 列表本身当作执行事实。
- 进入任一 `end.*` 才形成自动沉淀边界；process 状态中的 report 与 plan 明确结论可供后续终结评估，但不会单独触发 partial finalization。
- Writer 递归 hook 已在进程环境与 CLI preflight 两层被阻断；外层 harness plan 若不应沉淀，仍需要单独的 session-scope lifecycle，而不是依赖 runner guard。
- Job、report result、encoding、refresh 和持久化顺序成为可回归的完成证据；相邻 report 同时保留原始 turn 结论与可按 `finalizeId` 读取的 writer 结果。
- 单次 Stop 可以恢复同一 turn 内多个成功 `task.done` 返回对应的 assistant conclusions，并与该 turn 的最终 report 一起保存；多轮完成由各轮 Stop 分别追加，writer 不区分这些信息来自哪个 task。
- OpenCode host 的 finalizer agent 入口收敛为单一 `packages/opencode-adapter/agents/claw-knowledge-writer.md`。该 `mode: primary` agent 由 host-aware finalizer 经 `opencode run` 直接启动（不是 main-agent subagent dispatch，因此与 `claw-researcher` 的 `mode: subagent` 形态不同），不加载 `using-claw-kit`，也不派发另一个 writer 或拆分 pass；host-aware finalizer 动态选择 configured skill，并要求其 host session 中存在达到 `end.completed`、tasks 非空且全部 `done` 的 session workflow，不要求内置 template identity。retired `claw-truth-writer.md` 与 `claw-adr-writer.md` agent 不再随 OpenCode adapter 发布，对应 discovery 目录由 `installOpencodePlugin` 在安装期移除。

## Related Code

- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/knowledge-governance.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/knowledge-hook-preflight.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/codex-transcript.ts`
- `packages/cli/src/opencode-runner.ts`
- `packages/opencode-adapter/agents/claw-knowledge-writer.md`
- `shared/skills/knowledge-writer/`
- `packages/codex-adapter/skills/knowledge-writer/`
- `packages/opencode-adapter/skills/knowledge-writer/`
- `.claw/truth/adr/external-writer-skill-config.md`

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
- `command: task.done`
- `task_conclusion`
