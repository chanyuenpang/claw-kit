# CLI-guided workflow

<!-- state: current -->
## 结论

- planning 拥有 requirements / proposed-solution refinement、scope 与 task quality；default template 与 `plan start` 拥有从讨论态进入执行态的 lifecycle bridge，`plan-review` 不再是必须单独经过的 workflow gate。
- `claw-kit` 主线是 CLI-driven `.claw` harness，而不是 Apps SDK / app / widget / chat-rendering surface。
- `claw plan write`、`claw plan edit`、`claw plan done` 共享 compact result core：`ok`、`planPath`、`planStatus`、紧凑 guidance 字段、`planSummary`，以及适用时的 `completionRefresh`。
- root `claw plan done` 进入 `end.completed` 时额外返回 `achievement`、完成后的 canonical `planPath` 与本线程继续使用 claw 的 `nextsteps`。`achievement` 汇总 title、task counts、`completedAt`、retrospective 与 key-decision 保存状态；它是 foreground lifecycle completion signal，不代表异步 knowledge finalization 已完成。
- 当前 Codex root `plan.done` completion projection 存在一个已复现的 compact-result 缺陷：fixed driver 已按 `hostActions` 成功执行 `update_goal(status="complete")`，但仍把 `end.completed` guidance 的第一条 `Use update_goal(status="complete")` 原样暴露在 `nextsteps`。再次照做会重复已经消费的 native action，并在 Goal 已关闭时得到 `cannot update goal because this thread has no goal`。这不改变 `hostActions` 是 Codex 唯一 host 执行源且每个 action 只消费一次的合同；在 projection 修正前，返回的这条重复 Goal 指示不是待执行 action。实现锚点是 `packages/core/src/workflow-guidance.config.json` 的 `end.completed.nextsteps`、`packages/cli/src/cli.ts` 的 root `plan.done` nextsteps projection，以及 `packages/cli/src/codex-driver.ts` 的 terminal-field filter。
- subplan `plan done` 恢复 parent 时，结果状态和 `planPath` 属于恢复后的 parent，且不得返回 terminal `achievement`；只有真正完成 root plan 的 `plan.done` 才暴露该字段。
- `claw plan edit` 现在会先进入共享 ticket queue 再读取 canonical plan；重叠编辑按顺序串行执行，并在各自轮次开始时重新读取最新已提交的 plan，而不是依赖命令启动时的旧快照。
- plan mutation 不再接受通用 JSON patch 或临时文件。`claw plan edit` 只编辑 plan 字段，数组字段通过可重复的同名参数追加；`claw plan remove` 用同一字段名删除精确值。
- task item 统一走 `claw task add/edit/remove/done`，不再把 task 的增删改和 plan 字段编辑混在一个命令中。
- `claw plan edit` 与 `claw task add/edit/remove/done` 现在把同一命令中的重复参数组解析为按 argv 从左到右执行的 mutation chain；既有单操作语法保持兼容，`claw plan edit` 仍不承担集合删除。
- mutation chain 会先完成整条命令的语法校验：语法错误时零提交；进入语义执行后则逐步持久化，首个语义失败会停止后续 operation，但保留此前成功步骤，并返回包含失败 operation 与剩余数量的结构化 partial 结果。
- chain 的 `workflowGuidance`、completed-task 事件、session binding、completion hooks、plan mirror 与 Goal action 只按 mutation 前后的初始和最终 plan 状态归约一次；中间 lifecycle 状态不触发 side effect。合法的 `process.active -> process.wait -> process.active` 等同命令状态链因此不会产生虚假的 Goal 操作。
- `claw plan write` 支持最简 positional title 入口：`claw plan write "<title>" [--goal "<text>"]`，`--goal` 可以省略。
- 是否创建 plan 由请求是否预期产生可复用事实、决策、约束、模式或项目上下文决定，而不是按文件数、步骤数或其他维度加总复杂度。
- `claw plan create` 在启用 planning 时只创建一个 planning bridge task，并让 plan 先处于 `process.discussing`；该 task 同时承担 planning readiness 与 activation 边界，任务如何划分继续由 planning skill 独立拥有。default template 通过 task `guidance.onPlanStart` 声明“完成当前 task 并进入 `process.active`”；`claw plan start` 在同一次原子 mutation 中提交 planning 结果并应用这项声明，不再需要独立的 `Enter process.active` task。
- Default Task 1 先区分用户是在要求执行还是进行开放讨论，再调用 effective planning skill 澄清 requirements 并准备 task list。采用 solution 前必须让用户看到其中与决策相关的内容；只有它引入 meaningful choice 时才等待用户回应，不能把复杂度或 task 数量机械转换成确认门。
- effective planning skill 来自 project config 与 template `configOverride` 合并后的 `externalPlanningSkill`，空值或未配置时回退到 `claw-kit:planning`。`{{planningSkill}}` 同时渲染进 bridge title 与 detail，因此默认值和 override 都会直接显示实际 skill 名称。
- `process.discussing` 表示执行已暂停、当前工作转为用户讨论。它既可作为 plan 初始状态，也可从 `process.active` 重新进入，并且可以跨轮次稳定停留；plan 已存在或方案已可执行都不会自动要求推进 lifecycle，讨论解决后才恢复到 `process.active`。
- `plan start` 不读取 task title、语言、bridge 数量或 legacy skeleton 来推断 lifecycle。它定位当前 pending/in-progress task，按 plan 持久化的 `templateId` / `templateFile` 解析同一 template，并只执行该 task 的 `guidance.onPlanStart`；Goal Mode 仍由进入 `process.active` 后的 host action 投影拥有，不写入 planning skill 或 bridge detail。
- `claw plan create` 的 seed plan 现在还会持久化 `plan.templateId` 和模板专属的 `plan.configOverride`，所以后续 `plan edit` / `plan done` 可以重新解析原始 template 并复用同一套 template guidance。
- template guidance 现在以 task skeleton 的 `guidance.onDone` 为准；如果模板定义了 `guidance.onDone.choices`，任何进入 `done` 的路径都必须带上匹配的 `choiceId`，否则会触发带 choice 列表的定向错误。
- `guidance.onDone.default` 即使没有 choices 也可以影响默认 workflow guidance；模板路由对象统一使用 `mergeMode: "override" | "replace"`。`delegateTruth` 只作为旧 template cache 的 inert compatibility metadata 被接受，不再控制当前 writer 路由。
- `claw task done --id <number> [--choice <choice-id>]` 和 `claw task edit --id <number> --status done --choice <choice-id>` 属于同一条 route-aware completion contract，会把 `task.choiceId` 一起写入并接受 template-bound 校验。
- `plan.configOverride` 是 template-only 的 runtime overlay，会通过同一条 effective-config path 影响 `autoUpdate`、`goalMode`、`knowledgeWriter` 与 `externalPlanningSkill`；它不是独立的用户级 plan patch 入口。
- `plan write` 落在 `prepare.requirements` 且缺少 `goal.text` 时，`workflowGuidance` 的第一优先动作是先补 `goal.text`，再补 `requirements`、`tasks`、`references`、`rules`、`keyDecisions`，需求足够清楚后立刻切到 `process.active`。
- `goal.text` 是离开 `prepare.requirements` 的硬门；没有 goal 时，任何把 plan 切到 `process.active` 的尝试都应直接失败。
- `process.wait` 和 `process.discussing` 是 canonical 的暂停 / 讨论态，不是执行态；`process.wait` 适用于真实阻塞或刻意暂停，`process.discussing` 适用于路线讨论或决策讨论，二者都会暂停 Goal Mode，并且都只提示恢复时回到 `process.active`。
- 当 `plan.status` 从 `process.wait` 或 `process.discussing` 恢复到 `process.active` 时，`packages/core/src/workflow-guidance.ts` 会把这次进入识别为 `process.resumedActive`，并让 `goalMode.setWhen = on_resume_process_active`，而不是把它当成普通的首次进入执行态。
- 旧版 release flow 中 task 2 `Enter process.active` 的实跑只作为版本化证据保留，不再是 `plan start` 的 current compatibility shape。当前 `claw plan start ...` 只应用当前 template task 的 `guidance.onPlanStart`；没有该声明的旧 plan 不会通过标题或任务数量被隐式识别。恢复场景仍可通过高级 `claw plan edit --status process.active` 显式进入执行态。
- `process.allTasksDone` 是 root plan 的 pre-closeout contract：当所有 task 都完成时，`workflowGuidance` 要求清理 thread progress 并完成 retrospective；root `claw plan done` 随后记录完成态与 `completedAt`，但不会立即归档 task，也不会从 foreground 派发 writer。
- plan 命令不再返回 render blocks，不再提供 `claw plan app` / `claw plan render`。
- 当前 plan 读取命令是 `claw plan show`；`claw plan view --json` 不是 alias，会以 unknown subcommand 失败。诊断与文档应使用 `plan show`，不能从内部 `PlanViewModel` 名称反推公开 CLI 命令。
- 当前 `claw plan wait` 只接受 plan target override，不接受 `--reason`；暂停原因不会由该 alias 写入 canonical plan。为 `plan view` 增加 alias 或让 wait 记录 reason 都只是 `0.1.86` 评估提出的改进建议，尚未成为已采纳合同。
- 当所有当前任务完成时，foreground 只完成 retrospective 与 `claw plan done`；Stop/session-idle sidecar 随后从 completed plan 和相邻 report 排队一次异步 `knowledge-writer` pass。completed plan 会在当前 task path 保留至少一小时，之后才由 retention 归档。

## Route-aware compact guidance

- `0.1.83` 的 live harness 曾暴露出可操作性缺口：task 尚未完成时，compact guidance 只给通用 `claw task done --id <id>`，没有暴露 choices 或真实 `--choice` 命令；省略 route 的错误也曾使用内部字段名 `choiceId`。这是历史证据，不是当前行为。
- 当前只要 next task 定义 `guidance.onDone.choices`，`workflowGuidance.nextTask.completionChoices` 就作为唯一结构化值来源列出全部 choice id；`commandHints` 只保留一条参数化的 `claw task done --id <id> --choice <choice>` 命令模板，并移除会失败的无 choice 通用 done 命令；`nextsteps` 只要求选择，不重复枚举合法值。`commandHints` 只是未来 mutation 的语法与检索辅助，不定义当前下一步，也不要求立即执行。
- 缺少必选 route 时，`PROJECT_CONFIG_INVALID` 错误使用公开 CLI 语法 `requires --choice`，同时给出 exact recovery command 与 available choices；`choiceId` 只保留为 `task` 的持久化字段名。
- 规范完成入口仍是 `claw task done --id <number> --choice <choice-id>` 或等价的 `claw task edit --id <number> --status done --choice <choice-id>`。

## 延迟归档与 retention contract

- plan completion 现在把 `completedAt` 写入 canonical `plan.json`。它是 task lifecycle 的唯一时间戳，同时驱动 delayed archive eligibility 与 archive pruning。
- `claw plan done` 完成 root plan 时保留当前 task path，不再立即把 task 移入 archive。completed plan 因此仍可从原 task 路径读取，给异步 closeout consumer 留出稳定窗口。
- `packages/core/src/task-retention.ts` 只在 `completedAt` 距当前时间至少一小时时归档 task；归档资格不再检查 plan `status`、是否为 current task，或 receipt 是否存在。缺少 `completedAt` 或尚未满一小时的 task 不会被这条 retention 路径归档。
- plan completion 不等待 hook-owned `knowledge-writer` 返回；一小时延迟归档保证异步 finalizer 能从原 task path 读取 completed plan。
- lifecycle 主锚点是 `packages/core/src/plan.ts`，retention 资格与移动逻辑位于 `packages/core/src/task-retention.ts`，job/writer orchestration 位于 `packages/core/src/knowledge-sidecar.ts` 与 `packages/cli/src/cli.ts`；对应 core/CLI tests 覆盖 `completedAt`、当前路径保留和延迟归档。

## 真实代码锚点

- 计划生命周期、`goal.text` gate、以及 `process.active` 禁入校验：`packages/core/src/plan.ts`（`writePlan()`、`validatePlanDocument()`、`editPlan()`）
- `editPlan` 的共享 ticket queue 串行化、显式字段更新与 plan/task mutation 分层：`packages/core/src/io.ts`、`packages/core/src/plan.ts`
- `prepare.requirements` guidance、`process.wait` / `process.discussing` / `process.resumedActive` 语义，以及 command hint 顺序：`packages/core/src/workflow-guidance.ts`、`packages/core/src/workflow-guidance.config.json`
- single planning bridge 与 `guidance.onPlanStart` 声明：`packages/core/src/templates/plans/default.ts`
- template-driven plan start、effective planning-skill fallback 与 current-task selection：`packages/core/src/plan.ts`、`packages/core/src/plan-templates.ts`
- CLI 的 positional title 入口、帮助文案与紧凑输出：`packages/cli/src/cli.ts`
- Codex driver 对 `plan.done` 终结字段的可见性过滤：`packages/cli/src/codex-driver.ts`
- 结果类型：`packages/core/src/types.ts`

## 验证基线

- `npm run build -w @claw-kit/core`
- `npm run build -w @claw-kit/cli`
- `npm run test -w @claw-kit/core`
- `npm run test -w @claw-kit/cli`
- `npm run check -w @claw-kit/codex-adapter`
- `packages/core/test/core.test.ts` 覆盖 `process.allTasksDone`、`goalMode` 和 `end.completed` 的 compact contract。
- `packages/cli/test/cli.test.ts` 覆盖 `plan write` 后的 `SessionStart` 恢复、`plan done` 归档、以及 completion refresh 的 release smoke path。
- `packages/core/test/core.test.ts` 与 `packages/cli/test/cli.test.ts` 覆盖串行化的并发 mutation、显式字段追加/删除、task item 增删改，以及旧通用输入被拒绝。
