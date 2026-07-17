# Codex Goal mode is a thread-level contract

## Context

`claw-kit` needed a way to align active plan execution with Codex Goal mode. The main risk was pretending the plugin could toggle Goal mode through a private host automation path when the documented host surfaces are `/goal` in the app, CLI, and IDE, plus thread goal tools when the environment exposes them.

As the workflow guidance matured, a second risk appeared: adapter instructions were still treating Goal mode as if it were a prose-only recommendation. That created two durable contract problems:

- `prepare.requirements` could imply that the agent should "set Goal Mode" before execution had actually entered `process.active`
- paused or completed lifecycle states could imply fake operations such as "pause Goal Mode" instead of using the real Codex goal tool contract

0.1.71 发布后的恢复验收进一步复现了一个边界缺陷：plan 从 `process.wait` 回到 `process.active` 时，先前标记为 `blocked` 的 Goal 仍会被视为 unfinished，直接重放 `create_goal` 因而失败。恢复桥接不能继续依赖 Agent 判断当前 Goal 状态，也不能要求 Agent 复现先前状态转换。

## Decision

Treat Goal mode as a thread-level Codex feature. `claw-kit` supplies the plan-derived objective and the calling policy, but it does not claim ownership of host-level goal runtime behavior.

Default policy:

- `prepare.requirements` does not emit an active-goal recommendation
- only when a plan first enters `process.active`, expose a `goalMode` recommendation from canonical `plan.goal.text`
- only entering or resuming `process.active` requests the executable Goal bridge to ensure the active target state
- Goal 桥接采用目标状态 `ensure` 语义：程序负责保证 plan lifecycle 对应的目标 Goal 状态已经达成
- 不要求 Agent 判断当前或先前 Goal 状态，也不要求 Agent 重放先前的 Goal 状态转换
- use `setWhen = on_enter_process_active` so `plan write` / `prepare.requirements` guidance does not claim Goal mode ownership before execution actually starts
- when execution resumes from `process.wait` or `process.discussing` back into `process.active`, ensure the active Goal mode state instead of replaying `create_goal` unconditionally
- when a plan moves into `process.wait` or `process.discussing`, return `goalTool.tool = update_goal` with `status = "blocked"` instead of inventing a pause-only Goal mode action
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
- resumed active execution keeps the Goal mode contract visible, so a wait/discussion pause does not strand the thread in a half-restored state.
- paused execution now has a durable, testable closeout rule: use `update_goal(status="blocked")` and stop pretending the thread stays in a special paused-goal runtime mode.
- completed execution now has a durable, testable closeout rule: use `update_goal(status="complete")` when the root plan reaches `end.completed`.
- Goal 恢复成为程序侧幂等保证；Agent 不再承担 Goal 状态探测、历史判断或状态重放责任。
- `blocked` Goal 仍被视为 unfinished 时，恢复路径也必须收敛到目标 active 状态，而不是因重复 `create_goal` 失败。
- The default template activation detail no longer depends on agent-side interpretation of Goal Mode prose, which keeps Codex and opencode output aligned with their respective host contracts.

## Related Code

- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/src/plan.ts`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/references/workflow-guidance-consumption.md`
