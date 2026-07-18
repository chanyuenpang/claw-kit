# Codex Goal mode is a thread-level contract

## Status

Accepted

## Context

`claw-kit` needed a way to align active plan execution with Codex Goal mode. The main risk was pretending the plugin could toggle Goal mode through a private host automation path when the documented host surfaces are `/goal` in the app, CLI, and IDE, plus thread goal tools when the environment exposes them.

As the workflow guidance matured, a second risk appeared: adapter instructions were still treating Goal mode as if it were a prose-only recommendation. That created two durable contract problems:

- `prepare.requirements` could imply that the agent should "set Goal Mode" before execution had actually entered `process.active`
- paused or completed lifecycle states could imply fake operations such as "pause Goal Mode" instead of using the real Codex goal tool contract

0.1.71 发布后的恢复验收进一步复现了一个边界缺陷：plan 从 `process.wait` 回到 `process.active` 时，先前标记为 `blocked` 的 Goal 仍会被视为 unfinished，直接重放 `create_goal` 因而失败。后续真实 Host 验收又证明，同一个 code-mode call 内 complete→create 会在调用结束结算 complete 时清掉新 Goal。因此恢复桥接既不能依赖 Agent 或错误文本判断状态，也不能把关闭旧 Goal 与创建新 Goal 合并进同一调用。

`0.1.75` 验收再次以真实 `plan.wait` → Goal 自动关闭、`plan.resume` → Goal 自动重建的链路确认该合同；这是本轮唯一观察到的 Goal 状态切换链路。

## Decision

Treat Goal mode as a thread-level Codex feature. `claw-kit` supplies the plan-derived objective and the calling policy, but it does not claim ownership of host-level goal runtime behavior.

Default policy:

- `prepare.requirements` does not emit an active-goal recommendation
- only when a plan first enters `process.active`, expose a `goalMode` recommendation from canonical `plan.goal.text`
- only entering or resuming `process.active` emits native schema-v1 `create_goal`
- Goal 桥接由 CLI 按提交后的 plan 状态确定性路由原生 action；不引入 `ensure_goal`，不读取 Goal 状态，也不匹配 host error text
- 不要求 Agent 判断当前或先前 Goal 状态，也不要求 Agent 重放或补偿先前的 Goal 状态转换
- use `setWhen = on_enter_process_active` so `plan write` / `prepare.requirements` guidance does not claim Goal mode ownership before execution actually starts
- when a plan moves into `process.wait` or `process.discussing`, Codex host projection emits `update_goal(status="complete")` so the old Goal is no longer unfinished
- when a later mutation resumes execution into `process.active`, emit `create_goal`; never combine the preceding complete and the new create in one code-mode call
- when a plan reaches `end.completed`, return `goalTool.tool = update_goal` with `status = "complete"` instead of leaving completion to an implied host-side Goal mode gesture
- if `plan.goal.text` is missing, block the lifecycle from entering `process.active` instead of emitting a premature Goal mode recommendation
- generated task detail is derived from program state, not inferred from prose: the default Codex/no-host path appends the existing `Using claw-kit, update plan, follow returned workflowGuidance，finish your goal：<planGoal>` objective when `goalMode` is enabled, explicit `host: "opencode"` preserves the older concise Goal Mode detail, and disabled `goalMode` keeps only the base activation detail

## Consequences

- The integration is honest about the host boundary.
- Active execution can still align with Goal mode automatically in tool-capable environments.
- Goal lifecycle changes are expressed through real Codex contracts, not adapter-invented pseudo-operations.
- The same plan remains portable across hosts, because the canonical source stays in `.claw`, while Goal mode remains an optional Codex-host enhancement.
- Goal mode no longer competes with requirements collection; agents finish filling `goal.text`, `requirements`, `tasks`, and related fields before active execution begins.
- `goalMode` emission becomes a one-time activation boundary on first `process.active` entry, instead of a repeated `plan write` side effect.
- resumed active execution gets a new Goal in the resume mutation call, so a wait/discussion pause does not strand the thread in a half-restored state.
- paused execution now has a durable, testable closeout rule: Codex projection uses `update_goal(status="complete")`, allowing the later cross-call `create_goal` to survive host settlement.
- completed execution now has a durable, testable closeout rule: use `update_goal(status="complete")` when the root plan reaches `end.completed`.
- Goal 恢复成为 plan-status router 的程序合同；Agent 不再承担 Goal 状态探测、错误文本匹配、历史判断或状态重放责任。
- 发布前必须用未发布的本地构建做真实 Host wait→active lifecycle 验收，确认 wait 后 Goal 为空、resume 后新 Goal 跨调用保持 active。
- The default template activation detail no longer depends on agent-side interpretation of Goal Mode prose, which keeps Codex and opencode output aligned with their respective host contracts.
- `plan.wait` 与 `plan.resume` 的真实验收结果支持把“先关闭、跨调用再重建”作为当前实现的可回归验证样本。

## Related Code

- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/src/plan.ts`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
- `packages/codex-adapter/scripts/code-mode-host-action-consumer.mjs`
- `.claw/tasks/实现-Goal-目标状态幂等保证并发布-0.1.72/plan.json`
- `.claw/tasks/验收-0.1.75-短Bootstrap-20260717T1255/plan.json`

## Search Terms

- `plan.wait`
- `plan.resume`
- `Goal auto-close`
- `Goal rebuild`
- `wait resume lifecycle acceptance`

## 2026-07-17 实测补充

指定完成 plan 的真实验收记录确认：`plan.wait` 返回 `update_goal(status="complete")`，后续 `plan.resume` 返回 `create_goal`；两步分属不同 mutation call，未要求 Agent 读取 Goal 状态或解释 `goalTool`。
