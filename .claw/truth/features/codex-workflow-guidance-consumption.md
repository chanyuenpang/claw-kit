# Codex workflowGuidance consumption

- Codex adapter 应把 `workflowGuidance` 视为主合同，但 planning 自身现在负责计划质量，不再把 standalone `plan-review` 当成进入下一阶段的必经门。
- 当 `claw` 计划命令返回结果时，adapter 应优先消费 compact 字段：`planStatus`、`workflowGuidance`、`planSummary`，以及需要时的 `completionRefresh`。
- `planSummary` 是聊天协作中可展示的紧凑计划状态；adapter 不应期待 render blocks、widget envelope、`claw plan app` 或 `claw plan render`。
- investigation-first 是 Codex workflow 的主流程规则：当 task 主要是调查、分析或证据收集，而不是直接实现时，应优先派发 `researcher` specialist。
- `researcher` 可由 task shape 触发，不必等待 `workflowGuidance.delegateSubagents` 明确列出；派发时使用 `explorer` + 显式 `claw-kit:researcher` skill item，并优先复用同线程已有 researcher。
- host 在 researcher dispatch 前不应内联读取 search skill；`claw search` 的 recall 步骤属于 researcher 自己的窄调查流程。
- `researcher` 的调查顺序应先 `claw search --query "<topic>"` 检索 `.claw` context、truth 和 ADR；当 canonical `gitnexus = true` 时，再发现并使用 GitNexus 相关能力做代码调查。
- 对研究型 delegate，host 必须等待结果；当前 task 依赖 research 结论时，不能跳过该 gate 继续执行。
- 当 guidance 指向 `truth-writer` 时，应在 plan closure 前沉淀 truth；当 completed-plan guidance 指向 `adr-writer` 时，completed `plan.json` 才是 ADR deposition bundle。
- `workflowGuidance.delegateSubagents` remains a mandatory structured contract when dispatching subagents, but its notes must not be read as "dispatch every returned writer entry unconditionally"; since `0.1.49`, the canonical wording is `When dispatching a subagent, each entry is a required structured contract whose fields must be honored directly.`
- `process.wait` 和 `process.discussing` 都是暂停型 guidance：adapter 不应把它们当作继续执行的信号，而应把它们理解为先调用 `update_goal(status="blocked")` 结束当前 active goal，等待恢复后再通过 `process.active` 继续。
- 当 `workflowGuidance` 在从 `process.wait` 或 `process.discussing` 恢复后返回 `goalMode` 时，adapter 应把它当成 `on_resume_process_active` 的重新激活，而不是 `plan write` 阶段的首次 Goal Mode 授权。
- `prepare.requirements` 阶段如果 `goal.text` 缺失，adapter 应先补 goal，再补其余 plan 字段；如果需求已经完整，补完后应立即把 `plan.status` 切到 `process.active`，而不是继续停留在 requirements。
- 启用 planning 的 `claw plan create` 会先返回 `process.discussing`，并预置 planning task 与 `Enter process.active` bridge task；adapter append downstream tasks 时必须保留 task 2，让它继续承担从 planning 输出进入 `process.active` 的桥接职责。
- `prepare.requirements` 不再返回 active goal 推荐；只有真正进入 `process.active` 后，host 才根据返回的 `goalTool` / `goalMode` 创建 thread goal。
- adapter 不应在 `plan write` 时启动 thread goal；只有 plan 首次进入 `process.active`，并且 `workflowGuidance.goalTool.tool = create_goal` 且 `goalMode.setWhen = on_enter_process_active` 时，才应消费 active-entry goal 合同。
- adapter 必须把“没有 `goal.text` 就不能进入 `process.active`”视为 harness hard gate，而不是可由 prompt 规避的建议。
- `goalTool` 是 real-tool lifecycle 合同，不是冗余提示：
  - `process.active.firstEntry` 与 `process.active.resumedActive` 使用 `create_goal(objective=goalTool.objective)`
  - `process.wait` 与 `process.discussing` 使用 `update_goal(status="blocked")`
  - `end.completed` 使用 `update_goal(status="complete")`
- 已恢复 session 的未完成 plan 现在是显式用户面 gate：当 `SessionStart` / recovered `workflowGuidance` 发现当前线程已有 unfinished plan 时，adapter 必须先告诉用户“线程里已经有未完成计划”，并询问是关闭当前 plan 还是继续推进它，然后才能开始无关的新工作；这条恢复期 gate 同时落在 `packages/core/src/workflow-guidance.config.json`、`packages/core/src/workflow-guidance.ts` 的 fallback recovered prompt、`packages/opencode-adapter/workflow-guidance.opencode.json`，以及 `packages/opencode-adapter/plugin/index.ts` 的 recovered prompt fallback / idle continuation 注入上。
- `end.completed` closeout 现在明确保留同线程 claw continuity：plan 完成后除了收尾当前 closeout，下一项工作仍应留在同一个 `claw-kit` 线程里，并重新经 `using-claw-kit` 路由回正式 workflow，而不是把 completed-plan closeout 当成退出 claw-kit 的边界。
- 当 task guidance 走 `guidance.onDone` / `guidance.onDone.choices` 时，host 不能把 `done` 视为无上下文的纯状态切换；如果返回结果要求 `choiceId`，adapter 必须把该值沿着 `claw task done` 或 `claw plan edit --task-choice` 的 route-aware completion path 原样传递，并接受 template-bound 校验失败。
- CLI compact result 现在会直接暴露 `goalTool`，所以 host 不需要从 prompt 文案里反推 goal lifecycle。
- `planning` 现在是唯一可见 plan skill，并吸收了原本拆在 standalone workflow skills 中的 lifecycle 与 `workflowGuidance` 消费规则。
- `packages/codex-adapter/skills/planning/SKILL.md`、`packages/codex-adapter/skills/using-claw-kit/SKILL.md` 与相关 references 都应遵循同一 CLI-driven compact guidance 合同。

## 真实代码锚点

- `packages/core/src/types.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/core/src/workflow-guidance.ts`
- `packages/cli/src/cli.ts`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/opencode-adapter/workflow-guidance.opencode.json`
- `packages/opencode-adapter/plugin/index.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`

## Plan create 的 project recall 合同

- template create、root plan create 与 subplan create 现在共享同一 create-time recall guidance：首条 `recommendedCommand` 是 `claw search --query "<topic>"`，`nextStep` 只写 `Run one project recall query.`。这一步是一次项目知识召回，用于在 planning 前恢复 `.claw` context、truth 和 ADR，不是代码调查。
- create-time project recall 由主流程直接执行，不触发 `researcher`。只有 task 本身进入真正的 investigation / research 流程时，才按 task shape 派发 researcher；不能因为 create guidance 推荐了一次 `claw search` 就额外 spawn researcher。
- researcher 内部仍以 recall-first 为窄合同，但文案保持为简洁单行：`Use project recall first when available: claw search --query "<topic>".`。这条指令属于已经发生的 research dispatch 内部顺序，不应反向扩张成“每次 project recall 都需要 researcher”。
- 裸 `claw search` 缺少 query 时，CLI 错误提示也直接给出同一标准格式 `claw search --query "<topic>"`，使 create guidance、researcher skill 和错误修复建议保持一致，避免继续传播裸命令或其他参数形态。
- create guidance 的配置源是 `packages/core/src/workflow-guidance.config.json` 中的 `planCreateRecall`，`packages/core/src/workflow-guidance.ts` 的 `applyCreateGuidance` 负责把它应用到 template/root/subplan create 结果；CLI 错误提示锚点是 `packages/cli/src/cli.ts`。
- adapter 的 research 内部文案锚点分别是 `packages/codex-adapter/skills/researcher/SKILL.md` 与 `packages/opencode-adapter/skills/researcher/SKILL.md`。三类 surface 必须保持命令格式和“recall 不等于 research dispatch”的边界一致。
- 本次源码回归验证为 CLI `69/69`、core `123/123` 通过。

### 最终 smoke 与回归证据

- 源码 CLI smoke 已同时锁定用户面输出与 create guidance 去重：`claw search --help`、`claw help search`、`claw search help` 均 exit `0`、usage 只写 stdout 且 stderr 为空；裸 `claw search` exit `1` 并直接提示 `claw search --query "<topic>"`；discussion 与 active 两类 create guidance 都恰好只包含一条 search `recommendedCommand`，不会重复推荐 recall。
- 最终验证通过 CLI `69/69`、core `123/123`、Codex bundle `13/13`、OpenCode bundle `7/7`，并通过完整 `npm run check`。这组证据共同覆盖 CLI help/error surface、core create guidance 和两个 host adapter bundle 的合同一致性。
