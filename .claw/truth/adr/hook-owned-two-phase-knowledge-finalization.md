# ADR: Hook-owned consistency-aware knowledge finalization

## Context

计划进入 `end.*` 后需要把可信的 `plan.json` 与相邻 turn report 沉淀为可复用 Truth 和 durable ADR，但 foreground plan lifecycle 不能等待 writer，也不能让 main agent 临场决定 writer 路由、模型替换或 canonical 文件位置。Codex 与 OpenCode 还需要使用各自的原生 runner，而 detached worker 不能因自身 Stop/SessionStart hook 再次排队形成递归 finalization。

早期 ADR 把沉淀描述为 main agent 在 `workflowGuidance` closeout 中派发 `truth-writer`、`adr-writer` 并复用线程内 specialist。后续 hook-owned sidecar 曾顺序运行两个 focused writer；`0.1.80` 已用一次 consistency-aware `knowledge-writer` pass 取代这个 phase split，使 canonical owner discovery、Truth 更新与 ADR 决策能在同一证据和当前项目状态下统一收敛。

2026-07-30 的只读 transcript 调查澄清了 report 分段的 host 边界：Goal Mode 可以在同一个 `turn_id` 中持续产生 commentary、工具批次、compaction 和多个 claw task checkpoint，直到 agent 把控制权交还给用户才触发一次 `Stop`。因此 `task.done` checkpoint 能恢复阶段结论，但它不是 Codex turn；反过来，`PostToolUse` 或 commentary 也只是内部消息/工具边界，不能冒充 host turn。

同日对 plan-done closeout 的内容与触发链进行只读评估后，还需要区分“final 是否包含新增知识”与“final 是否参与 lifecycle”两个问题。final 有时与 structured closeout 重复，有时却独有最终接受事实、证据入口、未验证项或交付边界。Background policy 仍只有取得非空 final message 后才会消费 `pendingTurnOwner` 并创建 job；Codex subagent policy 已把 job 物化与 Stop 解耦，但 claim 只冻结终态 mutation 前已有的 task conclusions。因此内容冗余不能推出所有 policy 都可省略 final，也不能把 background 的触发约束泛化到 subagent。

## Decision

### Completion authority and evidence

- Core owns the canonical claim and one terminal result. Native completion resolves credentials from the exact job's durable claimant/admission. The model supplies finalizeId and semantic outcome, not a copied token; supplied compatibility credentials still must match. Focus/template names never substitute for claim ownership.
- Authentication occurs under the job lock before expiry reconciliation, template deletion, report or encoding writes. Credential/actor/project/expiry refusal is prepare/known/none. Atomic write uncertainty stays commit/unknown; a known post-commit failure does not undo the result.
- Canonical terminal commits before ancillary report/encoding/cleanup/delegate effects. Effects are separately reportable and never authorize resending completion.
- knowledge.done.receipt authenticates and reads that claim without mutation. Reconnect uses registry-only session.open.receipt, not ordinary open/focus/refresh recovery; unsupported older owners reject, never downgrade. A terminal receipt proves commit only, with post-commit effects explicitly unverified. Running/expired is not replay permission.
- This is the shared CLI/session completion contract for DSH/Cindy and other controlled runners, not a change to standard agent-memory capture. Source/tests do not prove old installed CLI/Host activation.


- Foreground `claw plan done`、session binding 与 Goal Mode lifecycle 独立于知识采集；hook、report、runner 或 writer 失败一律 fail-open，不回滚 canonical plan state。
- `scope: "session"` 表示临时隔离 workflow，而非 project closeout 的另一种 launcher：它的任何 `end.*` mutation 都不得创建 finalization job、返回 `knowledgeDispatch` 或在 guidance 中暴露 claim / finalizer / subagent 路径。该 gate 必须位于 shared finalization creation，不能由 host launcher 事后过滤；project scope 继续遵循下列 lifecycle。
- Knowledge finalization 的 lifecycle trigger 属于完成型终态转换：`end.completed` 与 `end.closed` 登记一次 finalization；`end.leave` 是显式退出，必须解绑并撤销该 plan 的 queued/running knowledge state，而不启动沉淀。`process.active`、`process.wait` 与 `process.discussing` 只累计 report，不登记或启动沉淀。`packages/core/src/plan.ts` 以终态与 leave 分流识别该边界，并为 sidecar 提供独立 `endedAt`；`end.completed` 专属的 completion hooks 仍只拥有 completion event、subplan resume 与 `completedAt` 等完成语义。
- 完成型终态按固定宿主合同建立 finalization owner；`end.leave` 不建立 writer。原生 subagent 宿主中，capture-enabled 子计划完成时，即使恢复 `resumedPlanPath` 父焦点，Core 仍为子计划登记自己的 ready job；父 capture owner 与捕获起点继续保留，父计划之后完成时仍可产生独立 job。host adapter 负责 dispatch，子计划终态不能只作为 parent-focus restore 被吞掉。`knowledgeCapture:false` 仍禁止该 plan 创建 job。内部父子焦点切换不是 manual cancellation，不得清除另一 active plan 的 capture；切换到不同 root 必须开启新窗口。OpenCode 的 idle/Stop 采集与 standard 的 agent-memory 路线保持各自固定合同；旧可配置 launcher-policy 描述由 [固定宿主收口设计](<../../../docs/2026-10-02-fixed-host-knowledge-closeout.md>) 取代。
- Codex report 的目标语义是一条记录对应一个真实 agent turn 的最终 assistant message；`turn_id` 是 turn identity，`Stop` 是该 turn 的 flush 边界，Goal Mode 内部 commentary、工具批次、compaction 和 claw task checkpoint 都不增加 report 分段。捕获优先使用 Stop payload 的最终 assistant message，transcript 仅作为兼容回退；`task.done` 不再具有特殊捕获意义。
- 当前保留 plan-done turn 的 final message，且不能按“通常重复”全局省略。Background 若未来实施内容去重，必须先让 finalization job 由显式、可持久化的 turn-stopped/coverage 状态触发而不依赖非空 message；所有 policy 仍需让 structured closeout 覆盖结果、失败与绕路、未验证项及遗留项，才可以只对确认没有内容增量的 final 停止持久化。
- 上述 turn-level report 合同已经确定，但 2026-07-30 的工作仅完成只读调查，尚未修改产品代码。当前实现仍会在 `Stop` 时扫描同 turn 的成功 `task.done` 并写入 `task_conclusion`；实施状态与运行事实由 `../features/codex-knowledge-capture-boundary.md` 唯一拥有，不能把本 ADR 的目标合同表述为已交付行为。
- Main agent 不决定 governance assignment、canonical owner 或 Truth→ADR 路由，也不等待 executor。原生 subagent route 的终态 plan mutation 先创建 ready job，再返回结构化 `knowledgeDispatch`（含 `preferReuse: true`）；Codex Host 只按该 immutable dispatch 优先复用同线程中固定名为 `knowledge_finalizer` 的 worker，不存在时创建同名 worker 并结束回合。Stop 不再捕获、排队、启动或修改该 job，这项 launcher dispatch 也不恢复旧 `workflowGuidance` writer specialist 合同。
- 执行路线由 invoking host 固定拥有，旧 `executionPolicy` 仅是兼容输入，不再选择 launcher。各 route 共享 immutable job、assignment builder、claim ownership 与 done protocol；transport 和 originating-report capture 保留宿主独立边界。
- Delegate orchestration template、built-in governance contract 与 dependent `doc-updater` 都是 Core 内部资源，不以 user skill 发布。未配置 `externalSkills` 时，claim 物化 canonical 维护与一致性复查两个 outcome tasks；配置时物化有序真实 skill assignments。可选 doc-updater 在 canonical 维护后、终末复查前执行，独立报告 changed paths、no-edit reason 或 failure，不否定成功的 Truth/ADR 维护。source plan/report 是只读 transient materials，不是输入 schema。
- `externalSkills`、`model`、`reasoningEffort` 与 `datedSectionsToKeep` 在 job 创建时快照。内置、外部及 direct same-agent prompt 均复用现有 `knowledge-format.md` 最小格式、结论证据、实现锚点和无关编辑保护；外部 skill 选择方法，不替换 canonical 最小合同。模型/effort 是冻结的尽力偏好，不改变 identity、claim 或 accepted/unknown no-replay 边界。
- Codex internal delegate template 先建立 session-scoped parent workflow，再以 `projectRoot + finalizeId` 直接 claim 已由终态 mutation 创建的 ready job；不运行 `knowledge wait`。claim 在授予 ownership token 前冻结父 transcript 中已有的 task conclusions，并返回动态 template；同一 executor 顺序完成 assignment subplan；`done` 由 Core 核对精确 claim actor 或独立 CLI bearer 后写入终态；动态 template 清理是后置效果。claim job 与 plan lifecycle 保持为两个明确状态机，避免 claim 内部直接创建 subplan 的跨事务失败。Cindy 的专用 delegate template 通过 Ghost operations 建立同样的 parent/subplan/done 边界，而不是直接执行 returned prompts。
- Cindy 只使用相同 ready-job 时序，report source 由插件原子操作拥有：Orca Writer 的 session delegate 通过 Host-forged workspace 调 `knowledge.claim(finalizeId)`；插件从 job 读取 originating session identity，固定等待十秒让对应 `knowledgeDispatch` tool result 进入 Cindy SQLite，再从 `reportCapture.startedAt` 扫描到下一个 plan-create 边界，提取成功 `task.done` 的前置结论。它们在同一 job lock 内写入相邻 report、标记 captured、最后签发 token。delegate 再用 claim 返回的 `templatePath` 创建 assignment subplan，并以真实 claim 身份调用一次 `knowledge.done`，不由模型抄写 token。Lead 的 final response 与 `did-turn-end` 不创建、补写或解锁该 job；旧 Cindy background job 只保留诊断可见性，不再通过 errand 启动。
- A returned `knowledgeDispatch` is the authorization for that Worker to execute the matching finalizer. In Cindy's dispatched Worker path, `finalizeId` identifies the job; persisted `job.host` and `writer.executionPolicy` are immutable provenance and launcher snapshots, not a second eligibility gate. Capture, claim, and token-completion failures remain reportable.
- Codex background、OpenCode 与 Cindy subagent 复用这个 lifecycle owner；Codex `subagent` 是另一种 launcher。所有 executor 都使用同一内部 bootstrap，而不是为 background 与 subagent 维护两套 writer prompt 或 assignment 编排。
- 内容治理成功后，Core 先持久化 succeeded canonical job；适用的编码、刷新、finalizeId 去重报告和 delegate 收口是后置效果。失败单列，不撤销终态或重发 knowledge.done；回执恢复明确标注后置效果未核实。内置/external 内容治理边界仍由 bounded-truth-and-adr-evolution-governance.md 拥有。
- `succeeded` result 与 job 持久化后，finalizer 不调用 Git。Truth/ADR 写入与治理、成功记录和 index refresh 完成后，canonical 文档改动留在工作区，由正常开发流程审阅和提交。
- Finalizer 不再主动删除 report。report 与 source plan 同属 task directory，归档时一起移动到 `.claw/archive/tasks/`，仅在 task retention 超过 `maxTasksToKeep` 并裁剪整个 archived task 时删除。新项目与缺失配置统一使用共享默认值 `9`；通用 task layout 与 retention 事实由 `../features/task-layout-and-session-bindings.md` 记录。
- Hidden built-in governance 统一拥有 conclusion-evidence qualification 与 one-owner consistency；调查、候选阅读、编辑和复查允许按需往返，不规定 Truth→ADR 固定推理阶段。Core 不以任意 delegate/assignment workflow 的 `end.completed`、非空 tasks 或全部 `done` 为成功终态门禁；claim 身份、terminal CAS 与 no-replay 仍是 authoritative safety。

## Alternatives Considered

- 由 main agent 任意选择 writer specialist：拒绝，因为会把 assignment、模型替换和完成判断交回主线程。Host 只能消费 Core 生成的 immutable launcher dispatch；Codex 按固定名 `knowledge_finalizer` 复用同线程 worker，不存在时以 Host 原生创建方式启动同名 worker，且不等待。DSH 的 role 路由由 [DSH delegation ADR](<dsh-delegation-contract-ownership.md>) 拥有，不把 Codex 的名称或模型侧派发方式推广到 DSH。
- 顺序运行 focused `truth-writer` 与 `adr-writer`：已取代。phase split 会让第二个 writer 重新发现候选与解释第一阶段输出，并可能留下跨 Truth/ADR 的竞争 current claim；combined stewardship pass 以同一份 freshness-qualified evidence 一次完成 owner reconciliation。
- 在 combined writer 内强制 Truth-only、ADR-only、both、no-op route 或固定调查阶段：拒绝。Truth/ADR 应在同一证据视野下维护，方法可按需要调整；无合格变化时报告 evidence-backed no-edit，而不是制造 ADR 或为了走完阶段改写文档。
- 让 built-in writer 依靠通用 skill discovery 或“可能产生可复用知识”的前台启发式自动触发：拒绝，因为这会在 hook-owned finalizer 之外形成第二个 invocation owner，并可能重复沉淀、提前沉淀或递归进入 writer harness。
- 仅设置 launch-disable 环境变量跳过 job：拒绝，因为 queued/failed job 会在后续 SessionStart 被重新发现；真正的 no-deposition workflow 应由显式 session scope 或持久化 policy 表达。
- 只要求每个 external skill template 声明 `scope: "session"`：拒绝，因为动态 skill 未必使用 claw template；session isolation 由内部 delegate parent/subplan统一拥有。
- 让 `wait` 建立 executor binding，或用 current focus/template 名称替代 claim authority：拒绝。可信会话身份可以在 Core 核对既有 claim owner，但不能猜最近 job、绕过代次或自动续租；普通 CLI 保留明确 bearer 凭据。
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

<!-- dated: 2026-10-15 -->
### OpenCode plugin closeout uses native child sessions

The OpenCode plugin now creates and prompts the writer through the live OpenCode service rather than launching `opencode run` for normal plugin closeout. Core persists parent/project/child association and reserve/bind/send-attempt state; only the associated child may claim, and accepted or unknown delivery is not replayed. Parent permissions are copied explicitly, and only the writer session suppresses claw automation. This remains an in-service execution path, not a detached-worker survival guarantee; source and unit evidence do not prove Linux real-model deposition. OpenCode install/agent and operational details belong to [the OpenCode install pipeline](../features/opencode-plugin-install-pipeline.md) and adapter reference.

<!-- dated: 2026-10-08 -->
### Wrong copied token must not masquerade as an uncertain commit

A finalizer supplied a token differing from its immutable claim at two positions before lease expiry. A plain credential error lacked phase/effect and surfaced as unknown. Authentication now precedes reconciliation, canonical commit precedes ancillary effects, and native completion authenticates the recorded claimant. Earlier token-only/report-first wording describes history, not the current contract. The historical incident was read-only inspected; no replay, lease renewal or fabricated success occurred.

<!-- dated: 2026-08-28 -->
### Leave no longer creates a writer job

The previous all-`end.*` finalization route let a user-requested leave detach the foreground workflow while a new or retained writer could still alter governed documentation. Leave is now a cancellation boundary: it unbinds immediately and revokes that plan's queued/running job, claim, and assignments. This preserves fail-open foreground lifecycle without permitting a departed workflow to write later.

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

<!-- state: current -->
## Consequences

- 完成期沉淀由一个 job owner 与一套 immutable delegate protocol 管理；Codex main agent 只在 `subagent` policy 下承担 launcher，不形成第二套 assignment 或 completion 合同。
- Automatic closeout 不依赖 skill discovery：Core internal resources 定义 executor 与 built-in governance，普通交互任务不会因 description 匹配自行进入沉淀。
- Hidden built-in governance 把 Truth 与 ADR 作为一个 knowledge system 审查，material fact 或 decision 不再由两个独立 writer 各自声明 owner；external skill 的语义合同不由本 ADR规定。
- Built-in governance 从所有提供材料中按内容提取明确结论；report 与 plan 只是 runtime materials。task status 只限定结论 scope，不把 task 列表本身当作执行事实。
- 进入任一 `end.*` 才形成自动沉淀边界；process 状态中的 report 与 plan 明确结论可供后续终结评估，但不会单独触发 partial finalization。
- Writer 递归隔离由内部 delegate session plan与 hook guard共同保证；job ownership 只由 claim token保证。external skill 即使未声明 session scope，也在 assignment subplan 中运行，不会回退到 project runtime。
- `subagent` path 的 job 在 dispatch 前已经 ready，主线程结束不再是 job trigger；Codex main agent仍必须在复用或创建固定名 `knowledge_finalizer` 后立即让出回合，避免 foreground 被异步治理阻塞。background worker必须按 policy退出，避免抢占该 finalizer。该不等待边界仍是 lifecycle 隔离合同。
- Job、report result、encoding、refresh 和持久化顺序成为可回归的完成证据；相邻 report 同时保留原始 turn 结论与可按 `finalizeId` 读取的 writer 结果。
- 在 background 的独立 Stop/coverage trigger 与强制 structured closeout 尚未交付前，final message 继续同时承担用户可见的最终接受结论、内容安全网和 background job 创建令牌。Codex subagent 的 ready job 不再依赖 final message，但 claim-time capture 只拥有终态 mutation 前已存在的 task conclusions；不得把两条 policy 的覆盖边界混为一谈。
- turn-level 合同实施后，单次 `Stop` 只保存其真实 agent turn 的最终 assistant message；同 turn 内多个 `task.done`、commentary 或工具批次不再制造额外 report entry。实施完成前的 checkpoint 捕获现状仍以 Truth owner 为准。
- OpenCode host 的 finalizer agent 入口收敛为单一 `packages/opencode-adapter/agents/claw-knowledge-writer.md`。该 `mode: subagent` agent 由 plugin 在当前 OpenCode service 中通过 native child session API 接收 internal bootstrap prompt；不加载 `using-claw-kit` 或公开 writer skill，也不递归派生 writer。retired writer agents 与 skill discovery directories 都不再发布。实现与失败边界见 [OpenCode native writer Truth](../features/opencode-plugin-install-pipeline.md)。

## Related Code

- `packages/core/src/knowledge-sidecar.ts`
- `packages/core/src/opencode-finalizer-execution.ts`
- `packages/cli/src/opencode-finalizer-execution.ts`
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
