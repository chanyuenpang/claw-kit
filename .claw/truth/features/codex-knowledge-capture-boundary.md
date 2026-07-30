# Codex 异步知识采集边界

<!-- state: current -->
## 结论

计划和 session binding 是 `claw-kit` 的前台 canonical lifecycle，必须独立于 Codex hooks。hook、report 或 SDK 的失败一律 fail-open：不能改变 `claw plan write`、`claw plan edit`、`claw plan done`、subplan 完成后的 parent 恢复，或 session binding 的语义。

知识采集使用与前台 lifecycle 分离的 per-session registry / outbox。创建 root plan 或 subplan 时，系统从确定性的计划路径派生相邻 report 路径：`<name>.json` 对应 `<name>.report`。计划从非 `end.*` 进入任一 `end.*` 时记录 pending turn owner；canonical lifecycle 同时按终态语义恢复 parent binding 或清除 root binding，不等待 report、hook 或异步 writer。

## 长期行为 / 规则

- 每次 Codex `Stop` 最多写一份 report。若当前 turn 有 pending ended plan，则该终态计划拥有最终 report；否则写入当前 active plan。终态切换的 transition turn 不得同时写入两份 report。
- 当前 Stop capture 要求存在非空的最终 assistant message：`packages/cli/src/cli.ts` 的 `runStopHook(...)` 在缺少 message 时直接返回，`packages/core/src/knowledge-sidecar.ts` 的 `tryCaptureKnowledgeStop(...)` 也会拒绝空 message。只有成功追加最终 report entry 后，sidecar 才会消费 `pendingTurnOwner` 并创建 `KnowledgeFinalizationJob`；因此 final message 当前既是知识材料，也是 job 创建所需的机械完成令牌，不能在未替换触发条件时省略。
- Codex transcript 的 `turn_context` / `turn_id` 标识一次完整 agent turn，而不是 Goal Mode 内部的一次推进。一个 Goal Mode 执行段可以在同一 `turn_id` 下连续产生多条 assistant commentary、多个工具批次、compaction 和多个 claw task checkpoint；只有 agent 停止并把控制权交还给用户时才触发 `Stop`，该 turn 才产生唯一的 `phase: "final_answer"`。
- 成功的 `task.done` compact response 已有 `ok: true` 与 `command: "task.done"`，不再增加专用 marker、plan 或 task identity。Codex driver 只在该成功返回中保留这两个既有字段，因此 transcript 中的 direct / deferred tool output 都可识别完成边界；失败输出或命令文本中的相似字样不构成成功结果。
- Codex `Stop` 从 transcript 尾部定位当前 Stop turn 的边界，只读取该轮的完整记录而不扫描更早轮次。每个成功 `task.done` 返回关联同 turn 内位于它之前且距离最近的 assistant message；没有可靠前置结论时跳过。sidecar 把所有合格结论作为 `entryType: "task_conclusion"` 追加到 Stop registry 当前拥有的相邻 report，再追加本 turn 的最终 report entry，不按 plan 或 task identity 过滤。
- 因此当前 `task_conclusion` 是同一真实 agent turn 内由 claw task checkpoint 恢复的阶段结论，不是独立 Codex turn。最终 report entry 才对应 `Stop` 所结束的真实 turn；在 `Stop` 发生前，即使该 turn 已完成多个 `task.done`，相邻 report 也不会出现该 turn 的新增记录。
- report 追加按 `sessionId`、`turnId`、entry type 与 message 幂等去重。因此同一 turn 可以保留不同结论，也可以同时保留最终 turn report；相同信息是否来自一个或多个 task 不影响 writer 消费。
- 当前 CLI 加载前的 knowledge hook preflight 只检查 hook cwd 直属的 `.claw`，不会向上解析项目根；因此从项目内 nested cwd 结束的 turn 会在读取 payload 和 registry 前直接退出，即使后续 `runStopHook` 与 project resolver 本可识别祖先项目。这会使该 turn 的 report、终态 job 与 writer 覆盖整体缺失，而不是仅降低单条 `task_conclusion` 的质量。
- Knowledge finalization executor 只异步消费进入 `end.*` 的 source `plan.json`、其相邻 report、finalize id、job host 与冻结的 writer 配置。`externalSkills` 非空时按顺序物化真实 skill assignments；列表缺失或为空时物化 Core 内部的 consistency-aware governance assignment。内置 assignment 共同维护 Truth 和 ADR、收敛每条 material current claim 的唯一 owner，但不以用户可发现的 `claw-kit:knowledge-writer` skill 形式发布。外部 skill 的 prompt 与治理边界由 `external-writer-skill-config.md` 唯一拥有；全部 assignments 成功完成后才请求 recall indexing。
- Codex 与 OpenCode 的 `using-claw-kit` 入口都明确告知 agent：eligible closeout 会自动把可复用知识沉淀进 canonical Truth。由该流程产生的 Truth 文件修改属于正常 workflow output，包括其他任务并行运行期间；仅观察到这类修改本身不构成写集冲突或异常沉淀的证据。
- `knowledgeWriter.executionPolicy` 只选择 executor launcher：`background` 是默认值，由 Stop 后启动独立 host agent；`subagent` 仅受 Codex 支持，终态 plan mutation 在 Stop 前返回确定性 `knowledgeDispatch`，主 agent 直接 `spawn_agent` 后结束当前回合且绝不等待。Stop 随后创建真实 job；background CLI worker看到 `subagent` job 会直接退出，不得 claim 或跨策略 fallback。
- 两种 launcher 都消费 `packages/core/resources/delegate-writer/TEMPLATE.json` 所定义的同一内部 session workflow：先以 `projectRoot + finalizeId` 执行 readiness-only `knowledge wait`，再以 `knowledge claim` 原子取得 `claimToken` 与动态 assignment template，然后创建 session-scoped assignment subplan、由同一 executor 依序完成全部 assignments，最后凭 token 调用一次 `knowledge done`。
- `knowledge wait` 只等待 Stop 创建 job，不建立、读取或验证 executor binding。session scope 来自内部 delegate template；`claim` 与 `done` 都是 session-agnostic 的 token lifecycle。`done` 只接受 active claim token 与匹配的终态结果，assignment template 在成功或失败终态后清理。
- Core 内部的 delegate template 与 built-in governance contract 都不进入 shared skill authoring、插件 `skills/`、manifest 或用户文档的可发现 skill surface。executor prompt 直接给出内部 template 路径，不要求 agent 加载 `delegate-writer` 或 `knowledge-writer` skill，也禁止再次派发 writer。
- 内置 governance 在动态 assignment template 中进入六任务 claw workflow，依次完成材料结论提取、证据新鲜度判断、canonical owner 搜索、Truth 维护、ADR 维护和跨文档一致性审查。writer 按内容解释所有提供的材料，不把 plan、report、closeout 命名或任何固定字段、记录形状、序列化格式当作输入 schema；source `plan.json`、相邻 report 与 finalize id 只是当前 finalizer 提供的具体 runtime inputs。task status 只解释 completed、pending 与 blocked scope，task 标题、描述、requirements 与 intentions 不能被提升为执行结果。writer 固定先维护 Truth、再维护 ADR，不设置 `truth` / `adr` / `both` / `noop` route task。
- 内置 SDK writer 成功返回后，detached worker 先治理该 pass 改动的 canonical Markdown，再递归检查 `.claw/truth/**/*.md` 并幂等补齐 UTF-8 BOM；dated-section trimming 是仅用于内置 writer 的确定性后处理。外部 skill 不建立治理快照或执行 dated trimming，但仍经过通用编码归一化与后续 finalization lifecycle。
- finalization 成功路径的顺序是 writer 完成、changed-document evolution governance、Truth/ADR 编码归一化、启动 completion recall refresh、向相邻 report 写入 `knowledge_finalization` 结果、持久化 `succeeded` job。finalizer 不调用 Git；canonical 文档改动留在工作区，由正常开发流程审阅和提交。
- report result writer 只接受 `.claw/tasks` 内的路径，并在文件锁下按 `finalizeId` 幂等写入。成功记录包含 result、recorded time、attempts、host、可用时的 writer thread，以及 Truth encoding 统计；重试命中已有同 id 结果时不得重复追加。
- finalizer 不主动删除 report。report 随整个 task directory 归档，并只在 task retention 裁剪对应 archived task 时删除；这一 retention 生命周期及默认值由 `task-layout-and-session-bindings.md` 记录，决策理由由 `../adr/hook-owned-two-phase-knowledge-finalization.md` 拥有。
- 主 agent 不判断 assignment、治理结果或 Truth→ADR 路由；仅在 Codex `subagent` policy 下消费结构化 dispatch、启动一个 fresh executor 并立即让出回合。combined writer 的返回文本不控制 fixed Truth→ADR deposition sequence，异步知识采集也不能反向接管 plan lifecycle。
- 前台 plan mutation 成功后，hook、report 或 SDK 的错误只能作为可观察的附加失败，不能回滚、阻塞或重写 canonical plan state。
- Codex host 的 SessionStart hook 显式调用 `claw context --host codex`。该 context 路径只检查 `%USERPROFILE%\.claw-kit\codex-runtime\<version>` 下用户级、版本化 SDK runtime 是否可用，不安装、不修复、不自动重试；非 Codex host 不承担这项检测。
- `@claw-kit/codex-adapter` 拥有 Codex SDK 依赖，通用 `@veewo/claw` CLI 不静态依赖 SDK。knowledge worker 从 context 已准备的 runtime 动态加载 SDK。
- runtime 健康时，公开 context 不输出 runtime 路径或版本；runtime 缺失或无效时，返回英文结构化 `CODEX_SDK_RUNTIME_MISSING` error，其 `requiresUserConsent` 为 `true`，且不提供固定 `repairCommand`。
- SessionStart 将该 error 的 agent prompt 前置到默认和已恢复 workflow 的 `additionalContext`；agent 必须先告知用户并取得同意，再根据当前环境诊断和选择安全修复方案，修复后重新运行 `claw context --host codex` 验证，不得盲目重复失败动作。

## 关联代码

- `packages/core/src/plan.ts`：canonical plan create/edit/done 与 root/subplan lifecycle。
- `packages/core/src/session-bindings.ts`：`sessionKey -> planPath` 的显式绑定及 parent 恢复。
- `packages/core/src/context.ts`：只通过 session binding 恢复当前 workflow。
- `packages/core/src/knowledge-sidecar.ts`：writer config snapshot、Truth/ADR Markdown 编码归一化、report 路径 containment 与幂等 finalization-result 写入。
- `packages/core/src/knowledge-assignments.ts`：统一 delegate dispatch、隐藏 built-in assignment、external skill prompt 与动态 assignment template。
- `packages/core/resources/delegate-writer/TEMPLATE.json` 与 `packages/core/resources/knowledge-writer/`：内部 session executor 与内置治理 contract。
- `packages/codex-adapter/scripts/knowledge-finalizer.mjs`：Stop capture 后只启动 policy-aware CLI worker。
- `packages/opencode-adapter/plugin/index.ts`：OpenCode 对 canonical CLI finalizer 的 background dispatch。
- `packages/cindy-adapter/plugin/node/claw-worker.cjs`：Cindy writer 注册、claim ownership 与终态写回。
- `packages/cli/src/knowledge-hook-preflight.ts`：CLI 加载前的 hook cwd 与 session knowledge target gate。
- `packages/cli/src/codex-transcript.ts`：按 turn 识别既有的成功 `task.done` 返回，并恢复最近的前置结论。
- `packages/cli/src/cli.ts`：Codex-facing CLI lifecycle 与 hook entry；在 Codex `Stop` 时把 transcript conclusions 交给 sidecar。
- `packages/core/src/knowledge-governance.ts`：本轮 changed canonical files 的 dated-section governance 与裁剪报告。
- `packages/codex-adapter/hooks/hooks.json`：SessionStart / Stop hook surface。
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 与 `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`：自动沉淀及正常 Truth workflow output 的入口提示。
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`：Codex-only `knowledgeDispatch` 的原生 subagent 消费合同。
- `packages/opencode-adapter/agents/claw-knowledge-writer.md`：接收内部 bootstrap prompt 的 OpenCode primary executor。

## 已知陷阱

- 不能根据目录扫描或 hook event 推断 active plan；无 session binding 时必须保持无恢复状态。
- 不能把 final message 当作可随意裁掉的重复文本；在当前实现中，空 message 会让 report capture 和终态 job 创建同时短路。若要解耦内容去重与 lifecycle trigger，必须先引入独立、可持久化的 Stop/coverage 完成状态。
- 不能把 nested cwd 没有直属 `.claw` 解释为“不在项目中”；当前 preflight 的直属目录 gate 会让整轮 report 与 finalization 不可观察地漏收。
- report 写入时不可把 pending ended plan 和已经恢复的 parent plan 都当成同一 turn 的 owner，否则会产生双写和不确定的 closeout 证据。
- 不能把 Goal Mode 内的 commentary、工具批次、compaction 或 claw task checkpoint 解释为新的 `turn_id`，也不能声称 `Stop` 会逐个 flush 这些内部推进。需要阶段级 report 时必须另行定义稳定分段信号，不能复用 turn 级边界冒充。
- 异步 writer 的完成状态与前台 `claw plan done` 成功是两件事；不得把后者表述为已完成 truth / ADR 沉淀。
- 不能在内部 session template 建立 scope 和取得 claim token 前运行 assignment，也不能在 `done` 时只校验 job path 或终态；否则 external skill 可以把普通 plan 写回 project runtime，或由非 claim owner 接管完成状态。`wait`、`claim` 与 `done` 都不得恢复旧 executor binding 合同。
- `subagent` policy 下主 agent 若等待 writer，Stop 就无法创建 writer 正在等待的 job；若 Stop worker忽略 policy，则 background 会抢先 claim。两条 launcher 路径必须保持不等待、无跨策略 fallback。

## 验证标准

- 人为让 hook、report 或 SDK 路径失败后，plan create/edit/done、subplan parent resume 和 binding 仍按 canonical lifecycle 完成。
- 创建 root plan 和 subplan 时，各自只有由 `.json` 派生的相邻 `.report` 路径。
- Stop preflight 必须覆盖项目根与项目内 nested cwd，并继续拒绝真正不属于该项目或没有 session knowledge target 的调用。
- 终态 transition 的 Stop 只产生一份、且属于 pending ended plan 的 report；普通 Stop 只属于 active plan。
- final-message capture 回归必须覆盖空 message 不创建 job、非空 message 才消费 `pendingTurnOwner` 并创建幂等 job，以及未来若解耦 trigger 时不再以 message presence 充当 Stop/coverage 状态。
- transcript capture 回归应覆盖 direct / deferred 成功输出、失败调用与文本伪阳性、同 turn 多次成功返回、最近前置 assistant conclusion，以及同一 Stop 重放的 report 幂等性。
- 真实 Codex transcript 验收应确认：一个 Goal Mode 执行段可在单一 `turn_context` / `turn_id` 下包含多条 commentary、多个工具批次与多个成功 `task.done`；`Stop` 前该 turn 尚未写入 report，`Stop` 后只有最终 entry 表示真实 turn，阶段结论仍明确标为 `task_conclusion`。
- worker 输入只接受进入 `end.*` 的 source `plan.json`、相邻 report、finalize id 与 job host；必须完成一次隐藏的 consistency-aware governance pass，再请求 indexing。
- 内置 real-worker 验收必须确认内部 delegate template 建立 session scope、六任务 guidance-backed 固定顺序 completion、Truth/ADR 协同审查、项目 canonical 输出边界，以及没有递归 finalization。外部 writer 验收应确认动态 skill prompt、无内置治理注入、无治理快照或 dated trimming；不完整 assignment subplan 仍失败。
- 分发面检查应确认 `delegate-writer` 与 `knowledge-writer` 均不存在于 shared 与 adapter skill discovery surface，Core package 保留两套内部资源，OpenCode primary agent 只消费内部 bootstrap prompt。
- knowledge finalization 回归应覆盖 changed-file governance、无 BOM Markdown 的自动修复、重复运行幂等、governance 与编码归一化先于 refresh、result 先于 `succeeded` job 持久化，以及 report 保留。
- lifecycle 回归应覆盖 readiness-only `wait` 不创建 binding、每次成功 claim 签发 token、`claim` 与 `done` 都不接受或读取 session identity、`done` 对相同终态结果幂等、动态 template 终态清理，以及任意 external skill assignment 仍只进入内部 session runtime。
- policy 回归应覆盖默认 `background`、非 Codex host 拒绝 `subagent`、终态 `plan done` / `plan edit` 的 deterministic dispatch、driver 字段可见性、主 agent 原生派发后不等待、Stop worker不 claim `subagent` job，以及 model / reasoning 配置传入 launcher。
- report result 回归应确认 `.claw/tasks` 内的 write、同 `finalizeId` 去重和原始 turn entry 保留；越界路径必须被拒绝，result 写回失败必须进入重试且不得伪造成功 job。
- runtime 回归需要同时覆盖健康 context 静默、缺失时的英文 consent-required error、无固定 repair command、SessionStart 授权 prompt 前置、adapter 依赖归属和 hook 的 Codex host 标记。
- sidecar 重试应能让先前因 runtime 发现失败的 finalization job 成功；使用同一 context runtime 再次执行时不得重复沉淀已有 truth / ADR。

<!-- state: history -->
## 演化历史

<!-- dated: 2026-07-18 -->
### 0.1.83 后置 writer 路由

- `0.1.83` 的真实 lifecycle 评测曾让父 plan 仍为 `process.active` 时运行的 `knowledge-writer` subplan 选择 `noop`；这是旧 completed-plan gate 与 route task 的版本化证据，不再描述当前沉淀资格。

<!-- dated: 2026-07-22 -->
### 移除 finalizer 自动 Git 提交

- 先前 finalizer 会在持久化成功 job 后，以隔离的临时 index 对本轮知识文档尝试 fail-open Git commit，并通过 `autoCommitKnowledge` 控制该行为。该运行路径和配置契约已移除；Git 提交回到正常开发流程。

<!-- dated: 2026-07-30 -->
### Report 捕获质量基线

- 对 9 个已归档任务的只读抽样中，8 个存在 report，共包含 16 条 `task_conclusion` 与 10 条 turn final；约 12 条 checkpoint 信息是可复用的设计事实、风险、根因或验收证据，约 4 条只是过渡状态。该基线说明筛选后的 checkpoint 相比全量 commentary 信噪比较高，但不能单独保证结论完整。
- 同一抽样有 1 个任务因 nested cwd 完全没有 report；另有失败归因、测试前置与替代验证关系只能由 plan retrospective 补回或仍然缺失。这个 incident baseline 保留用于解释为什么 report 覆盖与 source `plan.json` 的联合消费比单条消息质量更关键，不再作为未来 turn-level 捕获合同的决策依据。
- 对其中 8 个 plan-done turn 的进一步对照显示，约半数 final 基本重复 task conclusions、retrospective 与 key decisions，约半数补充了会改变沉淀强度的最终事实集合、证据入口、未验证项或交付边界。该样本只支持“不能全局假定 final 冗余”，不构成未来固定比例或完整性保证。

<!-- state: current -->
## 当前沉淀边界

- 当前 writer 以所有提供材料中的明确结论为证据边界；plan 与 report 只是当前 finalizer 的具体输入，不定义 writer schema。task status 仅解释结论 scope，task 列表本身不证明执行结果。没有 durable conclusion、存在 freshness 冲突或没有新增 durable knowledge 时形成 evidence-backed no-edit。
- 同一轮主 agent 只能审查进入该轮之前已有的 canonical diff，不能把尚未生成的 post-turn `plan.report` 或后置 writer 产物算作已审查证据。report 落盘后的 finalizer 只拥有本次沉淀的生成与合同内一致性自检；当前 job 没有 source turn 语义水位线或 stale-job cancellation，因此 writer 成功不证明更晚用户输入尚未纠正或取代 source conclusion，也不等同于独立 corpus 验收。
- 当前规范决策由 `.claw/truth/adr/hook-owned-two-phase-knowledge-finalization.md` 拥有。

## 关键检索词

- `fail-open hooks`
- `session binding`
- `pending turn owner`
- `plan report`
- `finalize id`
- `knowledge_finalization`
- `knowledge-writer`
- `consistency-aware knowledge finalization`
- `scope: session`
- `asynchronous truth ADR indexing`
- `CODEX_SDK_RUNTIME_MISSING`
- `requiresUserConsent`
- `command: task.done`
- `entryType: task_conclusion`
- `extractTaskDoneConclusions`
- `turn_context`
- `phase: final_answer`
- `Goal Mode turn boundary`
- `knowledge wait claim done`
- `executorSessionId`
- `claimToken`
- `knowledgeDispatch`
- `executionPolicy`
- `internal delegate template`
