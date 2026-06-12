# CLI-guided workflow

## 结论

- planning 现在直接拥有 requirements 到 process 的质量门；`plan-review` 不再是必须单独经过的 workflow gate。
- `claw-kit` 主线是 CLI-driven `.claw` harness，而不是 Apps SDK / app / widget / chat-rendering surface。
- `claw plan write`、`claw plan edit`、`claw plan done` 的默认返回值是 compact contract：`ok`、`planStatus`、`workflowGuidance`、`planSummary`，以及可选 `completionRefresh`。
- `claw plan write` 支持最简 positional title 入口：`claw plan write "<title>" [--goal "<text>"]`，`--goal` 可以省略。
- 正常的 planned work 先用 `claw plan write` 绑定 task scope；如果 project recall 有帮助，再在 `plan write` 之后运行 `claw search --query "<topic>"`，而不是把 recall 提前到 task scope 之前。
- `plan write` 落在 `prepare.requirements` 且缺少 `goal.text` 时，`workflowGuidance` 的第一优先动作是先补 `goal.text`，再补 `requirements`、`tasks`、`references`、`rules`、`keyDecisions`，需求足够清楚后立刻切到 `process.active`。
- `goal.text` 是离开 `prepare.requirements` 的硬门；没有 goal 时，任何把 plan 切到 `process.active` 的尝试都应直接失败。
- 低复杂度 direct work 仍然可以跳过正式 planning；当 complexity score 低于 `4` 时，`claw direct` 允许在执行前先跑一次 `claw search --query "<topic>"`，只在需要历史上下文时补一层 recall。
- `claw direct` 的 guidance/help 现在明确说，它可以先可选地跑 `claw search`，然后直接解决任务，必要时再可选 dispatch `truth-writer`，并复用 `claw plan done` 的异步 completion-refresh path。
- `process.allTasksDone` 是 root plan 的 pre-closeout contract：当所有 task 都完成时，`workflowGuidance` 会先要求清理 thread progress、完成 retrospective，然后把 `adr-writer` 作为下一步，再由 root `claw plan done` 负责最终归档和结束状态。
- 在 Codex adapter 侧，`claw plan done` 之后仍应执行显式 root-plan closeout；只有核验 `workflowGuidance.delegateSubagents` 要求的 `truth-writer` / `adr-writer` 确实已经发生，才能把这一轮宣布为 complete。
- 如果这一轮带有 git commit flow，closeout 还要检查仓库里的 task-related doc residue，把 canonical truth / ADR 更新和同轮产出的其他 shipped docs 一并收口。
- `process.allTasksDone` 在 0.1.38 之后明确要求在 ADR closeout 前先更新 `retrospective` 与 `keyDecisions`，`workflowGuidance` 也会提供面向补丁收口的 follow-up 命令来推进最终 plan state。
- plan 命令不再返回 render blocks，不再提供 `claw plan app` / `claw plan render`。
- 当所有当前任务完成时，CLI 仍先把可复用知识交给 `truth-writer`，再走 retrospective 与 `claw plan done`；计划完成后再把 `plan.json` 交给 `adr-writer`。

## 真实代码锚点

- 计划生命周期、`goal.text` gate、以及 `process.active` 禁入校验：`packages/core/src/plan.ts`（`writePlan()`、`validatePlanDocument()`、`editPlan()`）
- `prepare.requirements` guidance 与推荐命令顺序：`packages/core/src/workflow-guidance.ts`
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
