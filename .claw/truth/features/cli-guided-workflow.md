# CLI-guided workflow

## 结论

- planning 现在直接拥有 requirements 到 process 的质量门；`plan-review` 不再是必须单独经过的 workflow gate。
- `claw-kit` 主线是 CLI-driven `.claw` harness，而不是 Apps SDK / app / widget / chat-rendering surface。
- `claw plan write`、`claw plan edit`、`claw plan done` 的默认返回值是 compact contract：`ok`、`planStatus`、`workflowGuidance`、`planSummary`，以及可选 `completionRefresh`。
- `claw plan edit` 现在会先进入共享 ticket queue 再读取 canonical plan；重叠编辑按顺序串行执行，并在各自轮次开始时重新读取最新已提交的 plan，而不是依赖命令启动时的旧快照。
- `claw plan edit --patch` 现在采用 merge-patch 心智：对象递归合并，`null` 删除对象字段，数组整体替换；不再保留按字段定制覆盖的旧 patch 心智。
- `patch.tasks` 仍然不能和 `taskId` / `taskStatus` 放在同一个 `claw plan edit` 里；数组整体替换与 task progress 更新属于两种冲突意图，混用会被明确拒绝。
- `claw plan write` 支持最简 positional title 入口：`claw plan write "<title>" [--goal "<text>"]`，`--goal` 可以省略。
- `claw plan create` 在启用 planning 时会创建 seeded planning task 和 `Enter process.active` bridge task，并让 plan 先处于 `process.discussing`；planning task 追加 downstream executable tasks 时必须保留这个 bridge task，而不是覆盖它。
- `packages/core/src/templates/plans/default.ts` 里的 seeded activation task 生成现在会跟随 `goalMode` 与 host 语义：当 `goalMode = true` 且 host 不是显式 `opencode` 时，会把 `buildGoalModeObjective(...)` 产出的 recommended objective 追加到现有 activation task detail；Codex 默认的 no-host 路径按 Codex-compatible 处理并拿到这段 objective，显式 `host: "opencode"` 则保留旧的简洁 activation detail，而 `goalMode = false` 只保留 base detail。
- `claw plan create` 的 seed plan 现在还会持久化 `plan.templateId` 和模板专属的 `plan.configOverride`，所以后续 `plan edit` / `plan done` 可以重新解析原始 template 并复用同一套 template guidance。
- template guidance 现在以 task skeleton 的 `guidance.onDone` 为准；如果模板定义了 `guidance.onDone.choices`，任何进入 `done` 的路径都必须带上匹配的 `choiceId`，否则会触发带 choice 列表的定向错误。
- `guidance.onDone.default` 即使没有 choices 也可以影响默认 workflow guidance；模板路由对象统一使用 `mergeMode: "override" | "replace"`，并允许用 `delegateTruth: false` 局部关闭默认 per-task truth delegation。
- `claw task done --task <name> --id <number> [--choice <choice-id>]` 和通用 edit 路径里的 `--task-choice` 都属于同一条 route-aware completion contract，会把 `task.choiceId` 一起写入并接受 template-bound 校验。
- `plan.configOverride` 是 template-only 的 runtime overlay，会通过同一条 effective-config path 影响 `goalMode`、`truthDispatch` 和外部 planning / writer skill routing；它不是独立的用户级 plan patch 入口。
- `plan write` 落在 `prepare.requirements` 且缺少 `goal.text` 时，`workflowGuidance` 的第一优先动作是先补 `goal.text`，再补 `requirements`、`tasks`、`references`、`rules`、`keyDecisions`，需求足够清楚后立刻切到 `process.active`。
- `goal.text` 是离开 `prepare.requirements` 的硬门；没有 goal 时，任何把 plan 切到 `process.active` 的尝试都应直接失败。
- `process.wait` 和 `process.discussing` 是 canonical 的暂停 / 讨论态，不是执行态；`process.wait` 适用于真实阻塞或刻意暂停，`process.discussing` 适用于路线讨论或决策讨论，二者都会暂停 Goal Mode，并且都只提示恢复时回到 `process.active`。
- 当 `plan.status` 从 `process.wait` 或 `process.discussing` 恢复到 `process.active` 时，`packages/core/src/workflow-guidance.ts` 会把这次进入识别为 `process.resumedActive`，并让 `goalMode.setWhen = on_resume_process_active`，而不是把它当成普通的首次进入执行态。
- 在 release flow 实跑中，task 2 的 `Enter process.active` bridge 行为已被验证：`claw plan create` 返回 `process.discussing`，完成 planning task 后通过 `claw plan edit --plan-status process.active` 进入执行态，并在没有 active thread goal 时消费 `goalTool.tool = create_goal` 合同。
- `process.allTasksDone` 是 root plan 的 pre-closeout contract：当所有 task 都完成时，`workflowGuidance` 会先要求清理 thread progress、完成 retrospective，然后把 `adr-writer` 作为下一步，再由 root `claw plan done` 负责最终归档和结束状态。
- plan 命令不再返回 render blocks，不再提供 `claw plan app` / `claw plan render`。
- 当所有当前任务完成时，CLI 仍先把可复用知识交给 `truth-writer`，再走 retrospective 与 `claw plan done`；计划完成后再把 `plan.json` 交给 `adr-writer`。

## 真实代码锚点

- 计划生命周期、`goal.text` gate、以及 `process.active` 禁入校验：`packages/core/src/plan.ts`（`writePlan()`、`validatePlanDocument()`、`editPlan()`）
- `editPlan` 的共享 ticket queue 串行化、merge-patch 合并器，以及 mixed task patch 拒绝：`packages/core/src/io.ts`、`packages/core/src/plan.ts`
- `prepare.requirements` guidance、`process.wait` / `process.discussing` / `process.resumedActive` 语义，以及推荐命令顺序：`packages/core/src/workflow-guidance.ts`、`packages/core/src/workflow-guidance.config.json`
- seeded activation task 的 host-sensitive goal objective 拼接：`packages/core/src/templates/plans/default.ts`、`packages/core/src/workflow-guidance.ts`（`buildGoalModeObjective`）
- seeded planning / activation bridge task template: `packages/core/src/templates/plans/default.ts`
- CLI 的 positional title 入口、帮助文案与紧凑输出：`packages/cli/src/cli.ts`
- 结果类型：`packages/core/src/types.ts`

## 验证基线

- `npm run build -w @claw-kit/core`
- `npm run build -w @claw-kit/cli`
- `npm run test -w @claw-kit/core`
- `npm run test -w @claw-kit/cli`
- `npm run check -w @claw-kit/codex-adapter`
- `packages/core/test/core.test.ts` 覆盖 `process.allTasksDone`、`goalMode` 和 `end.completed` 的 compact contract。
- `packages/cli/test/cli.test.ts` 覆盖 `plan write` 后的 `SessionStart` 恢复、`plan done` 归档、以及 completion refresh 的 release smoke path。
- `packages/core/test/core.test.ts` 与 `packages/cli/test/cli.test.ts` 覆盖串行化的并发 `plan edit` 行为、merge-patch 的递归合并 / `null` 删除，以及 mixed-parameter 拒绝。
