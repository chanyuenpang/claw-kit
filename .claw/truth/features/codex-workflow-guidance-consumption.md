# Codex workflowGuidance consumption

- Codex adapter 应把 `workflowGuidance` 视为主合同，但 planning 自身现在负责计划质量，不再把 standalone `plan-review` 当成进入下一阶段的必经门。
- 当 `claw` 计划命令返回结果时，adapter 应优先消费 compact 字段：`planStatus`、`workflowGuidance`、`planSummary`，以及需要时的 `completionRefresh`。
- `planSummary` 是聊天协作中可展示的紧凑计划状态；adapter 不应期待 render blocks、widget envelope、`claw plan app` 或 `claw plan render`。
- investigation-first 是 Codex workflow 的主流程规则：当 task 主要是调查、分析或证据收集，而不是直接实现时，应优先派发 `researcher` specialist。
- `researcher` 可由 task shape 触发，不必等待 `workflowGuidance.delegateSubagents` 明确列出；派发时使用 `explorer` + 显式 `claw-kit:researcher` skill item，并优先复用同线程已有 researcher。
- host 在 researcher dispatch 前不应内联读取 search skill；`claw search` 的 recall 步骤属于 researcher 自己的窄调查流程。
- `researcher` 的调查顺序应先 `claw search --query "<topic>"` 检索 `.claw` context、truth 和 ADR；当 canonical `gitnexus = true` 时，再发现并使用 GitNexus 相关能力做代码调查。
- 对研究型 delegate，host 必须等待结果；当前 task 依赖 research 结论时，不能跳过该 gate 继续执行。
- `workflowGuidance` 不再派发 Truth/ADR writer。completed plan、相邻 report 与 job snapshot 由 Stop/session-idle sidecar 交给一次 combined `knowledge-writer` pass；main agent 不在 closure 前另行沉淀。
- `workflowGuidance.delegateSubagents` 的历史 writer entries 已退出当前 lifecycle；该字段若用于其他 specialist，仍按 returned structured contract 消费，不能据此恢复 main-agent writer dispatch。
- `process.wait` 和 `process.discussing` 都是暂停型 guidance：cross-host `workflowGuidance.goalTool` 继续描述 `update_goal(status="blocked")`；Codex adapter 不直接执行该 compatibility metadata，而是消费 CLI `buildHostActions` 按 committed `planStatus` 投影出的 schema-v1 `update_goal(status="complete")`，真正结束当前 Codex active Goal，再等待后续独立 mutation 恢复到 `process.active`。
- 当 `workflowGuidance` 在从 `process.wait` 或 `process.discussing` 恢复后返回 `goalMode` 时，adapter 应把它当成 `on_resume_process_active` 的重新激活，而不是 `plan write` 阶段的首次 Goal Mode 授权。
- `prepare.requirements` 阶段如果 `goal.text` 缺失，adapter 应先补 goal，再补其余 plan 字段；如果需求已经完整，补完后应立即把 `plan.status` 切到 `process.active`，而不是继续停留在 requirements。
- 启用 planning 的 `claw plan create` 会先返回 `process.discussing`，并预置 planning task 与 `Enter process.active` bridge task；adapter append downstream tasks 时必须保留 task 2，让它继续承担从 planning 输出进入 `process.active` 的桥接职责。
- `prepare.requirements` 不再返回 active goal 推荐；只有真正进入 `process.active` 后，host 才根据返回的 `goalTool` / `goalMode` 创建 thread goal。
- adapter 不应在 `plan write` 时启动 thread goal；只有 plan 首次进入 `process.active`，并且 `workflowGuidance.goalTool.tool = create_goal` 且 `goalMode.setWhen = on_enter_process_active` 时，才应消费 active-entry goal 合同。
- adapter 必须把“没有 `goal.text` 就不能进入 `process.active`”视为 harness hard gate，而不是可由 prompt 规避的建议。
- `goalTool` 是 real-tool lifecycle 合同，不是冗余提示：
  - `process.active.firstEntry` 与 `process.active.resumedActive` 使用 `create_goal(objective=goalTool.objective)`
  - `process.wait` 与 `process.discussing` 的 compatibility `goalTool` 使用 `update_goal(status="blocked")`；Codex hostActions 使用 `update_goal(status="complete")`
  - `end.completed` 使用 `update_goal(status="complete")`
- 已恢复 session 的未完成 plan 现在是显式用户面 gate：当 `SessionStart` / recovered `workflowGuidance` 发现当前线程已有 unfinished plan 时，adapter 必须先告诉用户“线程里已经有未完成计划”，并询问是关闭当前 plan 还是继续推进它，然后才能开始无关的新工作；这条恢复期 gate 同时落在 `packages/core/src/workflow-guidance.config.json`、`packages/core/src/workflow-guidance.ts` 的 fallback recovered prompt、`packages/opencode-adapter/workflow-guidance.opencode.json`，以及 `packages/opencode-adapter/plugin/index.ts` 的 recovered prompt fallback / idle continuation 注入上。
- `end.completed` closeout 现在明确保留同线程 claw continuity：plan 完成后除了收尾当前 closeout，下一项工作仍应留在同一个 `claw-kit` 线程里，并重新经 `using-claw-kit` 做 project-plan/direct-work 判断，而不是把 completed-plan closeout 当成退出 claw-kit 的边界。
- 当 task guidance 走 `guidance.onDone` / `guidance.onDone.choices` 时，host 不能把 `done` 视为无上下文的纯状态切换；如果返回结果要求 `choiceId`，adapter 必须把该值沿着 `claw task done --choice` 或 `claw task edit --status done --choice` 的 route-aware completion path 原样传递，并接受 template-bound 校验失败。
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

## `hostActions.update_plan` code-mode 自动消费 A/B

- 受控实验位于 `.claw/tasks/A-B-测试-hostActions-分步消费与-code-mode-自动消费/plan.json`。实验顺序固定为 A-B-B-A-A-B-B-A，每个 variant `4` 个样本，并对同一个 task #3 执行可逆的 pending / done 状态切换。
- Variant A 在一个 code-mode call 中执行 CLI mutation，再由 main agent 手动把返回的 `update_plan` payload 转抄到第二个 code-mode call。四次 `totalMs` 为 `5467`、`5686`、`5822`、`5172`，median `5577ms`、mean `5537ms`；`4/4` 成功，共 `8` 次 exec call 与 `4` 次人工 payload transfer。
- Variant B 在一个 code-mode call 中执行 CLI，解析 `Output:` marker 后的 JSON，只允许 `hostActions.tool === "update_plan"`，再调用 `tools.update_plan(action.input)`。四次 `totalMs` 为 `734`、`791`、`761`、`769`，median `765ms`、mean `764ms`；`4/4` 成功，共 `4` 次 exec call，且没有人工 payload transfer。
- 在当前 Codex code-mode surface 上，对 schema-compatible `update_plan` 使用单调用自动 consumer，比两调用手工 handoff 更容易且明显更快；它消除了 main agent 跨 model/tool boundary 复制 payload 的负担，并把每次 mutation 的 host 同步收敛到同一次 code-mode 调用。
- 该 A/B 当时只覆盖 `update_plan`；0.1.75 已在真实 Host 验证 native schema-v1 `create_goal` / `update_goal` 的固定消费路径，最终合同见下文。

### Host action schema 与同调用消费合同

- `packages/cli/src/cli.ts` 的 `buildHostActions` 为 `update_plan`、`create_goal`、`update_goal` 输出 native schema-v1 action。它保留 `workflowGuidance.goalTool` 作为 cross-host compatibility metadata，但根据 committed plan status 投影 Codex action：进入或恢复 `process.active` 输出 `create_goal({ objective })`，wait / discussing 把 compatibility `blocked` 投影为 `update_goal({ status: "complete" })`，completed 同样输出 `complete`，普通 active progress 不输出 Goal action；解释字段继续留在 `meta`，不进入 host tool input。
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 与 `packages/codex-adapter/references/workflow-guidance-consumption.md` 现在要求：在 Codex code-mode surface 上，每次 claw plan mutation 应在同一个 code-mode call 内执行 CLI 并消费 schema-compatible `hostActions`；消费时保持返回顺序与 action id。没有 direct-call、split-call 或 Agent 手写 Goal action fallback，固定程序或必需 host tool 不可用时直接停止。
- 自动 consumer 只执行已知且 schema-compatible 的 action；未知 schema、未知 action、不兼容 input 或非预期 host error 都必须 fail closed。`recommendedCommands` 继续只承载命令，不得把 host tool action 混入该字段或从命令文本反推工具调用。
- 定向验证中 Codex adapter tests `4/4` 通过；重建 CLI dist 后 CLI tests `72/72` 通过。首次 CLI test 使用了 stale dist，两个新增 schema assertion 失败；重建 CLI 即通过且不需要修改 source。涉及 dist-backed CLI 行为的测试失败时，应先确认构建产物是否同步，再判断 source contract 是否有缺陷。

## Codex 原生工具边界与固定 code-mode consumer

### 公开能力边界

- 官方 Codex manual 暴露的插件扩展面包括 skills、hooks 与 MCP；这些扩展面可以提供提示合同、生命周期触发和外部工具，但没有公开接口让插件代码或 `claw` CLI 子进程直接调用 Codex 原生 host tools。
- `update_plan`、`create_goal`、`update_goal` 的真实执行面是 code mode 中的 `tools` namespace。CLI 负责提交 canonical plan mutation 并输出结构化意图，不能越过 host 边界自行执行这些工具。
- 因此，Codex adapter 的最小可靠执行边界是：在单次 code-mode 调用内，由固定程序运行一个 claw plan mutation、解析 CLI JSON，并调用允许的原生 host tools。不能把 CLI 子进程直调 host tool 作为可实现路径。

### Codex-only 执行合同

- 对 Codex adapter，`hostActions` 是 host tool 执行的唯一来源。固定 consumer 必须按返回顺序处理 action，以 `id` 去重，校验 `schemaVersion`，并仅白名单允许 schema v1 `update_plan`、`create_goal` 与 `update_goal`。
- `workflowGuidance.goalTool` 继续由 core 输出，以兼容其他 host 及非 Codex 消费面；Codex Agent 不得在 `hostActions` 与 `goalTool` 之间二次判断，也不得把 `goalTool` 作为另一条执行入口。
- Agent 的职责只到提供并触发 canonical claw plan mutation。action 选择、顺序、去重、schema 校验、工具白名单、Goal 收敛和 input 投影属于固定 consumer；Agent 不读取或判断线程原有 Goal 状态。
- consumer 遇到未知 action、未知 schema version 或不兼容 input 时必须拒绝执行；不得从 `recommendedCommands`、prompt 文案或 `goalTool` 反推并补做 host tool 调用。

### 代码锚点与验证标准

- 主入口合同：`packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- 详细消费合同：`packages/codex-adapter/references/workflow-guidance-consumption.md`
- canonical CLI action 生成：`packages/cli/src/cli.ts`
- 决策与实施计划：`.claw/tasks/让-Codex-插件只走程序化-code-mode-consumer/plan.json`
- 验证必须覆盖 `update_plan`、`create_goal`、`update_goal`，以及顺序、`id` 去重、schema 拒绝、未知 action 拒绝和无 Agent fallback；同时确认 OpenCode 与 CLI canonical mutation 语义不因 Codex-only consumer 改动而改变。

### 关键检索词

- `Codex code-mode consumer`
- `hostActions unique execution source`
- `goalTool compatibility boundary`
- `tools.update_plan create_goal update_goal`

### 已实现的固定 consumer

- `packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs` 是可复用、可测试的 source contract：它从 shell 输出提取首个完整 JSON 对象，要求 mutation result 成功，并按 CLI 返回顺序消费 `hostActions`。
- consumer 接受 schema v1 `update_plan`、`create_goal` 与 `update_goal`，以 action `id` 做至多一次去重，并严格校验各 action 的 input 字段后直接调用同名原生 host tool。
- consumer 不预检线程 Goal 状态，也不解析 Goal tool error 来决定补偿动作。状态为 `blocked` 的 Goal 在真实 Host 中仍是 unfinished；CLI 因此在进入暂停态时先输出 `update_goal({ status: "complete" })`，后续独立 mutation 恢复到 active 时才输出 `create_goal({ objective })`。
- complete 与 create 不能合并到同一个 code-mode call：Codex 在 call 结束时结算 completion，会清除同一 call 中刚创建的新 Goal。fixed consumer 只执行当前 mutation 返回的 native action，不在一次调用内自行完成旧 Goal 后重建。
- action 只有在对应 host tool 成功返回后才会写入 consumed-id 集合；调用失败不会把该 `id` 标记为已消费，因此可以用同一 action id 安全重试。CLI mutation 已经提交，host tool 失败不回滚 canonical plan state。

### code-mode isolate driver

- Codex code-mode isolate 不能直接 `import` 本地插件模块，因此 `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 内嵌固定的 `runClawPlanMutation` driver；bundled script 是其可测试源合同，内嵌 driver 是实际 Codex 执行面。
- Agent 每次只修改 `command`、`workdir` 与可选 `timeout_ms`，不得改写 JSON 提取、schema 校验、action 顺序、id 去重、input 投影或 tool dispatch 分支。
- Codex 只消费 `hostActions`。不得执行 `workflowGuidance.goalTool`，也没有 split-call、direct-call 或 Agent 手写 action branch fallback；code mode 或必要 host tool 不可用时，固定程序直接报错并停止。

### 已验证证据

- `packages/codex-adapter/hooks/code-mode-host-action-consumer.test.mjs` 使用 `node:vm` 隔离提取并执行 skill 中实际嵌入的 `runClawPlanMutation`，证明测试覆盖的不是仅供参考的外部模块。
- 真实 unpublished-build Host 验证为：active → wait 输出 `update_goal complete`，下一次独立 `get_goal` 返回 `null`；wait → active 输出 `create_goal`，下一次独立 `get_goal` 返回 active Goal。
- core tests 继续覆盖 wait/discussing 的 cross-host `workflowGuidance.goalTool.status = blocked`；CLI tests 同时覆盖该 compatibility metadata 保持 blocked，以及 Codex schema-v1 `hostActions.update_goal.input.status = complete` 的投影。完整测试通过，且发布后的 `0.1.75` registry、全局 CLI、Codex plugin source / cache 均已验证。
- skill/reference 固定 contract 要求 Agent 只触发 consumer，不检查 Goal state、不解析 Goal error，也不手写替代 action。
