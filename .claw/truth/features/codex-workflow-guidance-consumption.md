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
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
