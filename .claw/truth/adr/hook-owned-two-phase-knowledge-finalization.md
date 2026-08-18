# ADR: Hook-owned consistency-aware knowledge finalization

## Context

计划进入 `end.*` 后需要把可信的 `plan.json` 与相邻 turn report 沉淀为可复用 Truth 和 durable ADR，但 foreground plan lifecycle 不能等待 writer，也不能让 main agent 临场决定 writer 路由、模型替换或 canonical 文件位置。Codex 与 OpenCode 还需要使用各自的原生 runner，而 detached worker 不能因自身 Stop/SessionStart hook 再次排队形成递归 finalization。

早期 ADR 把沉淀描述为 main agent 在 `workflowGuidance` closeout 中派发 `truth-writer`、`adr-writer` 并复用线程内 specialist。后续 hook-owned sidecar 曾顺序运行两个 focused writer；`0.1.80` 已用一次 consistency-aware `knowledge-writer` pass 取代这个 phase split，使 canonical owner discovery、Truth 更新与 ADR 决策能在同一证据和当前项目状态下统一收敛。

2026-07-30 的只读 transcript 调查澄清了 report 分段的 host 边界：Goal Mode 可以在同一个 `turn_id` 中持续产生 commentary、工具批次、compaction 和多个 claw task checkpoint，直到 agent 把控制权交还给用户才触发一次 `Stop`。因此 `task.done` checkpoint 能恢复阶段结论，但它不是 Codex turn；反过来，`PostToolUse` 或 commentary 也只是内部消息/工具边界，不能冒充 host turn。

同日对 plan-done closeout 的内容与触发链进行只读评估后，还需要区分“final 是否包含新增知识”与“final 是否参与 lifecycle”两个问题。final 有时与 structured closeout 重复，有时却独有最终接受事实、证据入口、未验证项或交付边界。Background policy 仍只有取得非空 final message 后才会消费 `pendingTurnOwner` 并创建 job；Codex subagent policy 已把 job 物化与 Stop 解耦，但 claim 只冻结终态 mutation 前已有的 task conclusions。因此内容冗余不能推出所有 policy 都可省略 final，也不能把 background 的触发约束泛化到 subagent。

## Decision

- Foreground `claw plan done`、session binding 与 Goal Mode lifecycle 独立于知识采集；hook、report、runner 或 writer 失败一律 fail-open，不回滚 canonical plan state。
- `scope: "session"` 表示临时隔离 workflow，而非 project closeout 的另一种 launcher：它的任何 `end.*` mutation 都不得创建 finalization job、返回 `knowledgeDispatch` 或在 guidance 中暴露 claim / finalizer / subagent 路径。该 gate 必须位于 shared finalization creation，不能由 host launcher 事后过滤；project scope 继续遵循下列 lifecycle。
- Knowledge finalization 的 lifecycle trigger 属于所有从非终态进入 `end.*` 的转换：`end.completed`、`end.closed` 与 `end.leave` 都登记一次 finalization；`process.active`、`process.wait` 与 `process.discussing` 只累计 report，不登记或启动沉淀。`packages/core/src/plan.ts` 以 `enteredEndState` 识别该边界，并为 sidecar 提供独立 `endedAt`；`end.completed` 专属的 completion hooks 仍只拥有 completion event、subplan resume 与 `completedAt` 等完成语义。
- root plan 或 subplan 进入任一 `end.*` 时按 launcher policy 建立 finalization owner：background 登记该 finalization turn 的 pending owner，并由下一次 Stop/session-idle 追加 report、创建幂等 job；subagent 在终态 mutation 内以 source plan、相邻 report、finalize id、writer config snapshot 与 host 直接创建 ready job，随后才返回 dispatch。
- Codex report 的目标语义是一条记录对应一个真实 agent turn 的最终 assistant message；`turn_id` 是 turn identity，`Stop` 是该 turn 的 flush 边界，Goal Mode 内部 commentary、工具批次、compaction 和 claw task checkpoint 都不增加 report 分段。捕获优先使用 Stop payload 的最终 assistant message，transcript 仅作为兼容回退；`task.done` 不再具有特殊捕获意义。
- 当前保留 plan-done turn 的 final message，且不能按“通常重复”全局省略。Background 若未来实施内容去重，必须先让 finalization job 由显式、可持久化的 turn-stopped/coverage 状态触发而不依赖非空 message；所有 policy 仍需让 structured closeout 覆盖结果、失败与绕路、未验证项及遗留项，才可以只对确认没有内容增量的 final 停止持久化。
- 上述 turn-level report 合同已经确定，但 2026-07-30 的工作仅完成只读调查，尚未修改产品代码。当前实现仍会在 `Stop` 时扫描同 turn 的成功 `task.done` 并写入 `task_conclusion`；实施状态与运行事实由 `../features/codex-knowledge-capture-boundary.md` 唯一拥有，不能把本 ADR 的目标合同表述为已交付行为。
- Main agent 不决定 governance assignment、canonical owner 或 Truth→ADR 路由，也不等待 executor。终态 plan mutation 在 `executionPolicy = "subagent"` 时先创建 ready job，再返回结构化 `knowledgeDispatch`（含 `preferReuse: true`）；Host 只按该 immutable dispatch 优先复用同线程中固定名为 `knowledge_finalizer` 的 worker，不存在时创建同名 worker 并结束回合。Stop 不再捕获、排队、启动或修改该 job，这项 launcher dispatch 也不恢复旧 `workflowGuidance` writer specialist 合同。
- `knowledgeWriter.executionPolicy` 在支持多种 launcher 的 host 上选择执行方式：`background` 默认在 Stop 后启动独立 host agent，Codex 也支持 `subagent`。Cindy 当前只支持 Orca subagent，并在 host 边界把 `background | subagent` 都归一化为 `subagent`；这是能力约束，不是失败 fallback。所有 launcher 共享 immutable job、assignment builder、claim token 与 done protocol；Codex 与 Cindy 分别消费 Core 内部的 shell-bridge 和 Ghost delegate template，但两者都以 session parent + generated assignment subplan 承载同一生命周期。
- Delegate orchestration template、built-in governance contract 与 dependent `doc-updater` 都是 Core 内部资源，不以 shared 或 adapter user skill 发布。未配置 `externalSkills` 时，claim 把隐藏 built-in contract 物化为 Truth→ADR 固定 workflow；配置 external skills 时，claim 物化真实 skill assignments。若 job 冻结了有效 external-document paths，claim 在任一路径后追加 `doc-updater` assignment；built-in template 把它插在 ADR 与跨语料一致性复查之间。source `plan.json`、相邻 report 与 finalize id 是 runtime materials，不是输入 schema；built-in contract 按内容解释材料并收敛一个 current owner。
- `knowledgeWriter.executionPolicy`、`externalSkills`、`model`、`reasoningEffort` 与 `datedSectionsToKeep` 在 job 创建时快照。内置与外部 assignment 使用不同 prompt builder：内置 prompt 直接表达治理合同，外部 prompt 明确调用 skill 并要求无人值守、无交互。model 与 reasoning 由对应 launcher 传给 executor；runner 不替换 job 指定配置。
- Codex internal delegate template 先建立 session-scoped parent workflow，再以 `projectRoot + finalizeId` 直接 claim 已由终态 mutation 创建的 ready job；不运行 `knowledge wait`。claim 在授予 ownership token 前冻结父 transcript 中已有的 task conclusions，并返回动态 template；同一 executor 顺序完成 assignment subplan；`done` 只凭 token 写入匹配终态并清理动态 template。claim job 与 plan lifecycle 保持为两个明确状态机，避免 claim 内部直接创建 subplan 的跨事务失败。Cindy 的专用 delegate template 通过 Ghost operations 建立同样的 parent/subplan/done 边界，而不是直接执行 returned prompts。
- Cindy 只使用相同 ready-job 时序，report source 由插件原子操作拥有：Orca Writer 的 session delegate 通过 Host-forged workspace 调 `knowledge.claim(finalizeId)`；插件从 job 读取 originating session identity，固定等待十秒让对应 `knowledgeDispatch` tool result 进入 Cindy SQLite，再从 `reportCapture.startedAt` 扫描到下一个 plan-create 边界，提取成功 `task.done` 的前置结论。它们在同一 job lock 内写入相邻 report、标记 captured、最后签发 token。delegate 再用 claim 返回的 `templatePath` 创建 assignment subplan，并以 token 调用一次 `knowledge.done`。Lead 的 final response 与 `did-turn-end` 不创建、补写或解锁该 job；旧 Cindy background job 只保留诊断可见性，不再通过 errand 启动。
- A returned `knowledgeDispatch` is the authorization for that Worker to execute the matching finalizer. In Cindy's dispatched Worker path, `finalizeId` identifies the job; persisted `job.host` and `writer.executionPolicy` are immutable provenance and launcher snapshots, not a second eligibility gate. Capture, claim, and token-completion failures remain reportable.
- Codex background、OpenCode 与 Cindy subagent 复用这个 lifecycle owner；Codex `subagent` 是另一种 launcher。所有 executor 都使用同一内部 bootstrap，而不是为 background 与 subagent 维护两套 writer prompt 或 assignment 编排。
- 内置 writer 成功后，worker 对该 pass 改动的 canonical Markdown 执行 dated-section governance 并记录裁剪结果；external skill 跳过治理快照与 dated compaction。两条路径随后都依次归一化 `.claw/truth/**/*.md` 编码、请求 completion recall refresh、向相邻 report追加一条以 `finalizeId` 幂等去重的 `knowledge_finalization` JSONL 结果，最后持久化 `succeeded` job。writer、适用的 governance、编码、refresh 或结果写回失败都进入既有重试路径；重复尝试不得伪造或追加第二条成功结果。Governance 的语义与取舍由 `bounded-truth-and-adr-evolution-governance.md` 拥有。
- `succeeded` result 与 job 持久化后，finalizer 不调用 Git。Truth/ADR 写入与治理、成功记录和 index refresh 完成后，canonical 文档改动留在工作区，由正常开发流程审阅和提交。
- Finalizer 不再主动删除 report。report 与 source plan 同属 task directory，归档时一起移动到 `.claw/archive/tasks/`，仅在 task retention 超过 `maxTasksToKeep` 并裁剪整个 archived task 时删除。新项目与缺失配置统一使用共享默认值 `9`；通用 task layout 与 retention 事实由 `../features/task-layout-and-session-bindings.md` 记录。
- Hidden built-in governance 统一拥有 conclusion-evidence qualification、Truth→ADR 固定顺序、候选阅读、freshness qualification 与 one-owner consistency；response format 与自然语言总结不参与控制流。delegate 与 assignment workflow 必须完成到 `end.completed`，tasks 非空且全部 `done`，才可写入成功终态。

## Alternatives Considered

- 由 main agent 任意选择 writer specialist：拒绝，因为会把 assignment、模型替换和完成判断交回主线程。Host 只能消费 Core 生成的 immutable launcher dispatch，并且只可按固定名 `knowledge_finalizer` 复用同线程 worker；不存在时以 Host 原生创建方式启动同名 worker，且不等待。
- 顺序运行 focused `truth-writer` 与 `adr-writer`：已取代。phase split 会让第二个 writer 重新发现候选与解释第一阶段输出，并可能留下跨 Truth/ADR 的竞争 current claim；combined stewardship pass 以同一份 freshness-qualified evidence 一次完成 owner reconciliation。
- 在 combined writer 内先选择 Truth-only、ADR-only、both 或 no-op route：拒绝。route task 会把本应固定执行的两个知识面变成额外控制流；当前流程始终先评估 Truth、再评估 ADR，每一阶段自行记录 evidence-backed no-edit。
- 让 built-in writer 依靠通用 skill discovery 或“可能产生可复用知识”的前台启发式自动触发：拒绝，因为这会在 hook-owned finalizer 之外形成第二个 invocation owner，并可能重复沉淀、提前沉淀或递归进入 writer harness。
- 仅设置 launch-disable 环境变量跳过 job：拒绝，因为 queued/failed job 会在后续 SessionStart 被重新发现；真正的 no-deposition workflow 应由显式 session scope 或持久化 policy 表达。
- 只要求每个 external skill template 声明 `scope: "session"`：拒绝，因为动态 skill 未必使用 claw template；session isolation 由内部 delegate parent/subplan统一拥有。
- 让 `wait` 建立 executor binding，或让 `claim` / `done` 读取 session identity：拒绝。session workflow scope 与 job ownership 是不同状态机；内部 template 负责前者，claim token 负责后者。
- 让 `claim` 内部直接创建 subplan：拒绝。claim 成功而 plan 创建失败会把 job 卡在 running 并制造跨事务回滚；claim只返回 token、assignments、template path 与下一步参数。
- 让 foreground 等待 writer：拒绝，因为 knowledge sidecar 失败不能阻塞 plan lifecycle。
- finalization 成功后主动删除 report：拒绝，因为这会丢失原始 turn 结论和 writer 的结构化完成结果，使异步 closeout 难以观察；report 应遵循已有 task archive/retention lifecycle。
- 直接删除或全局省略 plan-done final：拒绝。当前这会同时丢失可能独有的验证/交付边界，并因空 message 短路而阻止 finalization job 创建；单个样本中的重复不能充当全局安全证明。
- 在 background 仍由 message presence 触发 job 时只做内容相似度去重：拒绝。内容判定不能替代 Stop 已发生与 closeout 覆盖完整的显式状态，且会把 lifecycle 正确性绑定到不稳定的文本启发式。Subagent 以 terminal ready job 解除了机械触发依赖，但仍不能用相似度替代结论覆盖判断。
- 继续把成功 `task.done` 当作 report checkpoint：拒绝。它能恢复同一 turn 内的阶段总结，但会把 claw task 完成事件混入“逐 Codex turn 结论流”，且一次真实 turn 可以包含多个 checkpoint。
- 用 `PostToolUse`、assistant commentary 或工具批次近似内部 agent turn：拒绝。这些信号可以描述 Goal Mode 内部推进，却没有独立 `turn_id`，也不是稳定的 host turn/finalization 边界。
- 为 task checkpoint 增加专用 marker，或引入 mutation、host-action、plan、task identity：拒绝。额外身份仍不能把 claw task 事件变成 Codex turn，只会扩大 report 协议和维护成本。

<!-- state: history -->
## Evolution history

<!-- dated: 2026-08-04 -->
### External-doc governance 与 Cindy delegate template

- finalization job 现在在 `memory.autoUpdate` 有效时冻结 external doc paths，并把 dependent `doc-updater` assignment 追加到 built-in 或 external writer assignments 之后；它只治理冻结范围内已有文档。
- Cindy 保留 atomic claim-time report capture 与 Ghost transport，但不再直接执行 prompts；专用 session delegate template 现在拥有 claim、generated assignment subplan 与 token-protected done。

<!-- dated: 2026-08-01 -->
### Subagent terminal ready job 与 claim-time capture

- 早期 Codex subagent 先启动 executor，让它以 `knowledge wait` 等待主线程 Stop 创建 job；这让 job readiness 依赖 main agent 尽快结束，并把 final message 兼作机械触发令牌。当前终态 mutation 在返回 dispatch 前创建 ready job；executor 直接 claim，claim 在签发 token 前冻结父 transcript 已有的 task conclusions，Stop 不再拥有 subagent job。保留 background 的 Stop-owned capture，同时让各 policy 共用 job、assignment 与 token lifecycle。
- Cindy 对齐同一时序并收敛为唯一支持的知识 launcher：Lead 从 terminal tool result 获得 dispatch 后立即派 Orca Writer；Writer 使用 Ghost `knowledge.claim/done` 原子接口，claim-time 从 originating Cindy SQLite 固化 task conclusions。即使配置仍选择默认 `background`，Cindy 也先归一化为 subagent，不再等待 final answer、Stop hook、did-turn-end 或 errand；Host 侧 Orca Lead hook eligibility 修复仍作为独立通用 bug fix 保留。
- 2026-08-02 的 DeepSeek/Ghost 项目级 E2E 已完成 create、start、task done 与 plan done 生命周期，并在 Cindy atomic claim 签发 token 前把 originating task conclusion 写入相邻 report。该样本验证 Cindy ready-job 与 claim-time capture 分支；前台计划完成仍不等同于 writer 已成功沉淀。

<!-- dated: 2026-07-30 -->
### Launcher policy 与内部 delegate 取代公开 writer skill

- 先前 finalizer 运行公开 `knowledge-writer` skill，并一度让 `wait` 建立 executor binding；Codex main agent也没有真实的 subagent launcher。当前把 delegate template 与 built-in governance 移入 Core 内部资源，以 `background | subagent` 只选择 launcher；内部 template 拥有 session scope，`wait` 只等待，claim/done 完全由 token 驱动。

<!-- dated: 2026-07-30 -->
### Task checkpoint capture 被 turn-level report 合同取代

- 先前决策直接复用成功 `task.done` response 的 `ok: true` 与 `command: "task.done"`，在每次 `Stop` 中把同 turn 的成功返回绑定到最近的前置 assistant conclusion，并作为 `task_conclusion` 与最终 entry 一起保存。真实 transcript 调查证明这些 checkpoint 不是独立 Codex turn，因此决策改为每个真实 turn 只保留最终 assistant message。旧机制在新合同实施前仍是当前代码行为，保留本段用于迁移与回归解释。

<!-- dated: 2026-07-22 -->
### 移除 finalizer 自动 Git 提交

- 先前决策把一次隔离的 fail-open Git commit 作为 successful finalization 的后置副作用，并以 `autoCommitKnowledge` 作为项目配置 gate。该机制已完全移除：finalizer 只写入、治理、记录结果和刷新索引，文档提交由正常开发流程负责。

<!-- dated: 2026-07-21 -->
### External governance skills became unattended-adapter runs

The earlier completion gate applied to every writer session and the invocation instructed each selected skill to be followed exactly. The current finalizer keeps the built-in writer's strict workflow contract, but adapts external skills to unattended governance so their interactive gates are not treated as fulfilled by the runner itself.

## Consequences

- 完成期沉淀由一个 job owner 与一套 immutable delegate protocol 管理；Codex main agent 只在 `subagent` policy 下承担 launcher，不形成第二套 assignment 或 completion 合同。
- Automatic closeout 不依赖 skill discovery：Core internal resources 定义 executor 与 built-in governance，普通交互任务不会因 description 匹配自行进入沉淀。
- Hidden built-in governance 把 Truth 与 ADR 作为一个 knowledge system 审查，material fact 或 decision 不再由两个独立 writer 各自声明 owner；external skill 的语义合同不由本 ADR规定。
- Built-in governance 从所有提供材料中按内容提取明确结论；report 与 plan 只是 runtime materials。task status 只限定结论 scope，不把 task 列表本身当作执行事实。
- 进入任一 `end.*` 才形成自动沉淀边界；process 状态中的 report 与 plan 明确结论可供后续终结评估，但不会单独触发 partial finalization。
- Writer 递归隔离由内部 delegate session plan与 hook guard共同保证；job ownership 只由 claim token保证。external skill 即使未声明 session scope，也在 assignment subplan 中运行，不会回退到 project runtime。
- `subagent` path 的 job 在 dispatch 前已经 ready，主线程结束不再是 job trigger；main agent仍必须在复用或创建固定名 `knowledge_finalizer` 后立即让出回合，避免 foreground 被异步治理阻塞。background worker必须按 policy退出，避免抢占该 finalizer。该不等待边界仍是 lifecycle 隔离合同。
- Job、report result、encoding、refresh 和持久化顺序成为可回归的完成证据；相邻 report 同时保留原始 turn 结论与可按 `finalizeId` 读取的 writer 结果。
- 在 background 的独立 Stop/coverage trigger 与强制 structured closeout 尚未交付前，final message 继续同时承担用户可见的最终接受结论、内容安全网和 background job 创建令牌。Codex subagent 的 ready job 不再依赖 final message，但 claim-time capture 只拥有终态 mutation 前已存在的 task conclusions；不得把两条 policy 的覆盖边界混为一谈。
- turn-level 合同实施后，单次 `Stop` 只保存其真实 agent turn 的最终 assistant message；同 turn 内多个 `task.done`、commentary 或工具批次不再制造额外 report entry。实施完成前的 checkpoint 捕获现状仍以 Truth owner 为准。
- OpenCode host 的 finalizer agent 入口收敛为单一 `packages/opencode-adapter/agents/claw-knowledge-writer.md`。该 `mode: primary` agent 由 background finalizer 经 `opencode run` 启动，只消费 internal bootstrap prompt，不加载 `using-claw-kit` 或公开 writer skill；retired writer agents 与 skill discovery directories 都不再发布。

## Related Code

- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/knowledge-assignments.ts`
- `packages/core/resources/delegate-writer/TEMPLATE.json`
- `packages/core/resources/cindy-delegate-writer/TEMPLATE.json`
- `packages/core/resources/doc-updater/`
- `packages/core/resources/knowledge-writer/`
- `packages/core/src/knowledge-governance.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/knowledge-hook-preflight.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/codex-transcript.ts`
- `packages/cli/src/opencode-runner.ts`
- `packages/opencode-adapter/agents/claw-knowledge-writer.md`
- `packages/codex-adapter/scripts/knowledge-finalizer.mjs`
- `packages/opencode-adapter/plugin/index.ts`
- `packages/cindy-adapter/plugin/node/claw-worker.cjs`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
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
- `knowledge wait claim done`
- `executorSessionId`
- `claimToken`
