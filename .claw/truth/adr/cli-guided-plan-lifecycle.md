# ADR: CLI-guided plan lifecycle

## Status

Accepted

## Context

`claw-kit` 采用 prompt-first 的 Codex 工作流，agent 需要依据 CLI 返回结果遵守 `.claw` harness 规则。早期生命周期中存在独立的 `plan-review` 流程和偏冗长的计划变更输出，容易让适配器绕开规划语义、延迟界面刷新，或者把完成态沉淀步骤提前到计划真正结束之前。

针对 `hostActions.update_plan` 的 8 个 A/B 配对样本进一步验证了消费边界：CLI 与 host tool 分两次 Agent 调用的方案 A 中位数为 5577ms，需要 8 次调用和 4 次人工 payload 搬运；在同一次 code-mode 调用内运行 CLI 并消费 action 的方案 B 中位数为 765ms，需要 4 次调用且零搬运。两组均 4/4 成功，因此性能与执行负担差异来自调用编排，而不是 mutation 或 host 同步可靠性差异。

`0.1.70` 将该实验证据固化为正式 Codex adapter 合同，并完成 `hostActions` action schema、Goal 参数投影、同调用消费 guidance 与 legacy lifecycle 回归。完整测试、check、bundle、pack 和 release dry-run 均通过；npm、`origin/main`、全局 CLI 与本地 Codex plugin cache 已刷新并验证在同一版本线。

`0.1.75` 的验收证据显示，短 code-mode bootstrap 与缓存复用没有引入额外命令重试；普通 task mutation、`plan.wait`、`plan.resume` 均保持精简返回，且不携带 `hostActions`、`goalTool`、`nextsteps`、`notes`、`protocol` 噪声字段。

入口门禁继续暴露出另一个生命周期问题：按文件数、步骤数等维度加总复杂度，会漏掉规模小但会产生长期可复用知识的请求，也会把仍需与用户讨论路线的任务过早推进到 Goal Mode。plan 的创建价值与 active 执行的可脱手性是两个不同判断，不能因为 plan 已经存在就合并为一次激活决定。

本轮 plan/task mutation 批处理实现还需要解决一个生命周期一致性问题：如果把同一命令中的每个 operation 当成独立 mutation，合法的中间状态会过早生成 guidance、Goal action、session binding 或 completion hooks；如果整批只在末尾提交，又无法满足语义错误时保留此前成功操作的需求。

## Decision

把规划质量规则并入核心 planning 语义，并让对外 workflow contract 保持紧凑、render-first：

- 不再把独立 `plan-review` 作为核心生命周期阶段
- `planning` 成为唯一可见 planning skill；其他 legacy plan skill surfaces 不再作为 active main-agent workflow surface 保留
- root `claw plan write` 把最简 positional title 入口作为正式外部契约：`claw plan write "<title>"`，并允许 `--goal` 省略，先建立 task scope 再补全计划内容
- `claw plan write`、`claw plan edit`、`claw plan done` 的结果只保留成功信息、下一步、委派 specialist，以及可见计划渲染
- `prepare.requirements` 的 guidance 先要求补齐 `goal.text` 与计划字段，再根据需求是否清晰决定是否切到 `process.active`；不再把 goal mode 作为这个阶段的第一动作
- `process.active` 成为由 `goal.text` 驱动的显式执行门：`plan.goal.text` 未填写时，计划不能离开 `prepare.requirements`
- 是否创建 plan 的入口决策由 `using-claw-kit-session-entry.md` 拥有；本 ADR 只消费其 project-plan 结果，并规定后续 `process.discussing` / `process.active` 生命周期
- `process.discussing` 是允许跨轮次停留的稳定状态；plan 存在本身不触发 Goal Mode，也不要求自动进入 `process.active`
- 只有后续可执行子任务已经明确，并且用户可以脱手让 agent 继续推进时，plan 才从 `process.discussing` 进入 `process.active`
- default plan 用一个 planning bridge 同时承载 planning readiness 与 activation 边界；它要求与用户讨论并确认当前阶段的 requirements 和 proposed solution，再准备 task list。具体 task shape 由 planning skill 单独拥有，template 不重复规定；完成 draft 不足以关闭该 task，当前阶段 material open questions 解决后才调用 `plan start`
- shared planning skill 不新增强制的实施后 `user-review` task、同一 plan 的跨轮反馈循环或独立 review lifecycle；若工作可预见会反复修改，planning 可以询问用户是否要在 closeout 前增加 final `manual-review` task，但只在用户明确请求时加入。这是用户选择的 task-shape 扩展，不是默认 lifecycle stage；问题仍是执行前过早越过 solution discussion，而该门禁已经由 default planning bridge 与 shared planning 合同拥有。当前规则文案与实现锚点由 `.claw/truth/features/shared-planning-skill-source.md` 维护
- plan-start state change 由 current template task 的 `guidance.onPlanStart` 声明；default template 声明 `completeTask: true` 与 `status: "process.active"`，`plan start` 只提交 refined fields、追加 outcome tasks 并应用这项声明，不检查 task title、语言、bridge 数量或 legacy plan shape
- initial discussion guidance 展示的 skill 名称必须来自 project config 与 template `configOverride` 合并后的 effective `externalPlanningSkill`；未设置时固定回退到 `claw-kit:planning`。planning bridge 的 title/detail 不再重复这项路由信息
- foreground lifecycle 不再派发 knowledge writer；`process.allTasksDone` 只要求在 `plan done` 前持久化 retrospective 与 durable `keyDecisions`
- plan completion 登记 pending turn owner，下一次 Stop/session-idle 才由 `hook-owned-two-phase-knowledge-finalization.md` 所定义的 sidecar 捕获 report 并异步排队一次 combined `knowledge-writer` pass
- knowledge finalization 不阻塞 foreground closeout；它的失败、重试和完成状态不改变 canonical plan completion
- `end.completed` 写入稳定的 `completedAt`，但 `claw plan done` 保留当前 task directory 与原 `planPath`，不在本次命令中立即移动计划
- root `plan.done` 的 foreground completion contract 显式返回 `achievement`、完成后的 canonical `planPath` 与继续使用 claw 的 `nextsteps`，让调用方无需从 session binding 或 raw plan 重新推断完成结果。`achievement` 只证明 canonical root plan 已进入 `end.completed`；它不替代异步 knowledge-finalization 状态。
- subplan 完成并恢复 parent 时复用同一 `plan.done` 命令，但返回 parent 的 status、`planPath` 与 next task，且不返回 terminal `achievement`。这样 child closeout 不会被误呈现为整个 workflow 的终结成就。
- `claw plan start --requirements <text> --acceptance <criterion> --add-task <title> --detail <text>` 是原子 planning-result commit 入口：它默认作用于 session-bound 当前 plan/subplan，在一次序列化 mutation 中补齐计划、追加业务 tasks，并按 current task 的 template `guidance.onPlanStart` 完成 task 与状态转换；既有双 lifecycle-task plan 只保留为历史证据，不再由标题/shape heuristic 识别
- 原子结果使用 `schemaVersion = 1` 的 plan events；一次 mutation 共享 `mutationId`，每个事件有唯一 `eventId` 并记录 `commandSource`
- CLI plan state 继续是 canonical source；Codex adapter 单向消费幂等 `hostActions` 以同步 host progress 与 Goal Mode，OpenCode 直接消费其 host-specific guidance；invocation host 的解析、投影与 worker 路由见 `invocation-host-handling.md`，不把 host 状态反向写成第二份所有权
- schema 兼容的 Codex `update_plan` host action 默认在现有单次 code-mode 调用内自动消费，不再要求 Agent 把 CLI payload 搬运到第二次 host tool 调用
- 自动 consumer 是 code-mode 调用中的固定胶水逻辑，不生成或维护独立脚本文件；consumer 只按 tool 白名单向 host schema 投影参数
- `recommendedCommands` 只表达可执行的 CLI 命令；code-mode 同调用消费是 adapter 执行合同，不伪装成 CLI command
- 所有 `hostActions` 固定使用 `schemaVersion = 1`；`create_goal` 与 `update_goal` 的真实 host tool 参数只放在 `input`，`allowOverwrite`、`reason` 等策略信息放在 `meta`
- consumer 按 CLI 返回顺序和 action id 至多消费一次；CLI mutation 成功后若 host action 失败，只重试对应 action，不回滚 canonical CLI plan state
- 历史设计曾允许同调用消费不可用时退回分离 host tool 调用；当前 Codex 合同已由 `codex-plan-mutations-use-fixed-code-mode-consumer.md` 收敛为 fail closed，不再提供 direct-call 或 split-call fallback。正确性仍不依赖 `PostToolUse` hook。
- 既有 `claw plan create`、`claw plan edit` 与 `claw plan done` 保持兼容；`plan start` 是新增的短路径，不替换显式恢复和 legacy lifecycle surface
- plan/task 批处理采用按 argv 从左到右的 mutation chain：整条 chain 先做语法预校验，语法错误零提交；语义执行逐步持久化，在首个失败处停止，并保留此前成功 operation。
- chain 中间步骤不生成 lifecycle side effect；`workflowGuidance`、completed-task 事件、session binding、completion hooks、plan mirror 与 Goal action 仅根据 chain 初始和最终 plan 状态归约一次。
- `claw plan edit` 继续只拥有 plan 字段与状态，集合删除不进入该命令；task mutation 继续隔离在 `claw task add/edit/remove/done`，避免 plan 与 task ownership 因批处理耦合。

## Consequences

- Codex agent 可以直接从 CLI 结果拿到紧凑且顺序正确的下一步契约
- agent 被允许用最小参数先绑定任务，不必因为初始命令缺少完整 `goal` 而卡在 `plan write` 入口
- `prepare.requirements -> process.active` 的推进条件分成两层：知识沉淀预期只决定是否建立 plan；子任务明确度与用户可脱手性共同决定是否激活，未满足时可继续稳定停留在 `process.discussing`
- 单一 bridge 删除了独立 activation meta-task，却没有放松 activation gate：讨论完成与执行 readiness 仍是进入 `process.active` 的同一个明确边界；旧双任务 plan 若要恢复必须走显式 lifecycle mutation，不能依赖 `plan start` 猜测其结构
- 对外 plan-write / plan-status 合同更稳定，像 `release-0-1-25` 这样的版本发布可以把这组行为当作 release-worthy surface change
- 规划语义与展示语义保持一致，计划编辑后无需额外拼装另一套状态
- 生命周期门禁从文案建议上升为实际约束，避免无目标 active plan 进入执行态
- host lifecycle bridge 与 shared planning skill 都要求在进入执行前讨论并确认当前阶段的 requirements 与 proposed solution；当下游路线依赖未知证据时，shared planning 进一步把 decisive checkpoint 及其后续 planning task 定义为当前阶段方案。bridge 拥有 activation gate，task shape 与 staged-planning 决策仍由 `shared-planning-skill-source.md` 拥有
- 不引入 mandatory post-implementation review loop，避免用一套新的 lifecycle 机制重复解决执行前 solution discussion 已拥有的问题；可预见反复修改时的 final `manual-review` 只有用户选择后才成为普通 plan task，未选择时不会出现，后续用户反馈仍按实际目标和现有 plan mutation surface 处理，而不是由 planning skill 预置固定反馈流程
- finalizer-owned `knowledge-writer` 以一次 combined pass 维护 Truth 与 ADR，不作为 main-agent specialist 或 `workflowGuidance` delegation
- root plan closeout 需要先补齐 retrospective 和 `keyDecisions`；`claw plan done` 只提交 completion state、binding transition 与 completion refresh，不等待 knowledge job
- root completion signal 与 subplan parent-resume signal 保持可判别：调用方只在收到 root-only `achievement` 时展示终结结果，subplan resume 继续按 parent progress 处理
- completed plan 在原 task 路径至少保留一小时，使 Stop 之后排队的异步 finalizer 不需要切换到 archive 路径补救
- knowledge deposition 失败不会阻塞本次 plan closeout；job queueing 与异步完成语义保持分离
- 历史版本实跑对比说明，workflow feel 的主要回退点并不是 `plan write` 本身必然更重；新版 `plan write` 反而已经比部分旧版更窄、更干净
- 真正的回退来自 task 建立与推进被拆散到多个可见 surface：如果 startup recovery 先占据入口，而 `process.active` 又不够突出，`plan write` 就不再像唯一 task-scope 入口，主 agent 也更容易遗漏“计划后立即切到 active 执行”这一动作
- 因而这份 ADR 的 durable 含义不是单独继续压缩 legacy `plan write`，而是保持 `plan create -> process.discussing -> process.active` 作为最显眼、最连续的 project-plan 生命周期，避免被并列 surface 稀释
- 由于 planning contract 已合并，active skill surface 应避免再保留 `plan-workflow`、`plan-review` 一类独立可见入口来分散主线
- 固定 Windows low / medium / high 配对 A/B 中，legacy path P50 为 `902.79ms`，atomic path P50 为 `385.06ms`，改善 `57.35%`；计入 create-time recall 后，首个业务动作前的管理命令从 `6` 降到 `3`
- versioned events 与幂等 `hostActions` 让 Codex adapter 自动同步不需要双向协调，也保留手动 CLI 与旧入口的恢复能力
- `update_plan` 的单次 code-mode consumer 把配对样本的中位耗时从 5577ms 降至 765ms，并消除人工 payload 搬运；这支持把自动消费设为默认编排，而不是改变 CLI mutation 语义
- tool 白名单和参数投影限制自动化边界，避免把 CLI 返回中的策略或说明字段未经验证地传给 host tool
- host 同步失败与 canonical plan mutation 解耦后，恢复动作只需重放幂等 host action，不会因 host surface 瞬时失败撤销已经提交的计划状态
- `schemaVersion = 1` 与 `input`/`meta` 分离让 adapter 可以验证真实 host 参数，同时保留 overwrite/reason 等策略说明而不污染 tool schema
- action id、返回顺序与至多一次语义仍定义 host-action 恢复边界；历史分离消费路径已被后续固定 consumer 决策取代，CLI plan 的 canonical ownership 不变
- guidance-first 的实现先兑现已测收益且不依赖 hook 时序；是否增加 runtime consumer 成为可独立评估的成本决策，而不是当前正确性前提
- `0.1.75` 的 cold/warm driver 结果为同一 `driverVersion=3`、`cacheKey=claw-kit:codex-driver:v3:s1` 与 SHA，支持把短 bootstrap 的缓存身份作为可回归合同，而不是每次重新获取。
- 语法预校验与逐步语义提交兼顾了零提交的输入错误边界和可恢复的部分成功语义；调用方可从结构化 partial 结果定位失败 operation，而不需要猜测哪些前置步骤已落盘。
- 初始到最终状态的净归约避免合法中间状态产生虚假的 Goal 或 completion 操作，同时保持最终 plan mirror 与 canonical plan 一致。

## Related Code

- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/plan-view.ts`
- `packages/cli/src/cli.ts`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `shared/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
- `packages/core/src/workflow-guidance.config.json`
- `.claw/tasks/实现-claw-search-persistent-embedding-worker/plan.json`
- `.claw/tasks/用不可变-snapshot-修复-ADR-异步归档竞态/plan.json`
- `.claw/tasks/验收-0.1.75-短Bootstrap-20260717T1255/plan.json`
- `.claw/tasks/实施-claw-kit-第二阶段端到端性能与流程优化/plan.json`
- `.claw/tasks/A-B-测试-hostActions-分步消费与-code-mode-自动消费/plan.json`
- `.claw/tasks/优化-hostActions-单调用-code-mode-消费并发布新版本/plan.json`
- `benchmarks/workflow/0.1.68-atomic-windows.json`
- `docs/workflow-performance-contract.md`

## Search Terms

- `workflowGuidance`
- `plan write`
- `prepare.requirements`
- `process.active`
- `process.discussing`
- `knowledge deposition expectation`
- `handoff-ready activation gate`
- `goal.text`
- `plan edit`
- `plan done`
- `render-first`
- `planning`
- `required ADR writer`
- `waitForCompletion=false`
- `asynchronous ADR closeout`
- `completedAt`
- `delayed archive`
- `claw plan start`
- `schemaVersion = 1`
- `mutationId`
- `eventId`
- `commandSource`
- `hostActions`
- `CLI plan state canonical`
- `update_plan automatic consumer`
- `code-mode hostActions consumption`
- `tool allowlist parameter projection`
- `host action retry without CLI rollback`
- `hostActions schemaVersion 1`
- `Goal action input meta projection`
- `recommendedCommands CLI semantics`
- `ordered at-most-once action id consumption`
- `historical split-call fallback superseded by fixed code-mode consumer`
- `PostToolUse not required`
- `0.1.70`
- `0.1.75`
- `short code-mode bootstrap`
- `minimal mutation response`
- `ordered mutation chain`
- `syntax pre-validation`
- `partial semantic failure`
- `initial-to-final lifecycle reduction`
- `optional manual-review task`
- `user-selected review before closeout`
