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

`0.1.86` 的同版本 installed Host 验收随后证明，单靠 action projection 还不能形成稳定保证：wait 的 canonical mutation 成功后，resume 的 `create_goal` 仍遇到 unfinished Goal；root closeout 还暴露了 Goal 已为空时的重复 close 指示。当前 worktree 已在固定 driver/consumer 内加入 mutation 前 Goal snapshot 与目标状态 no-op，避免把补偿责任交回 Agent；这一程序化消费决策由 `codex-plan-mutations-use-fixed-code-mode-consumer.md` 拥有，当前运行事实由 `../features/codex-goal-mode-integration.md` 拥有。新的真实 Host lifecycle 验收仍是发布门禁。

## Decision

Treat Goal mode as a thread-level Codex feature. `claw-kit` supplies the plan-derived objective and the calling policy, but it does not claim ownership of host-level goal runtime behavior.

Default policy:

- Codex Progress synchronization applies to every nonempty `process.*` plan; its task projection is independent from optional Goal Mode policy
- `prepare.requirements` does not emit an active-goal recommendation
- only when a plan first enters `process.active`, expose a `goalMode` recommendation from canonical `plan.goal.text`
- only entering or resuming `process.active` emits native schema-v1 `create_goal`
- Goal 桥接由 CLI 按提交后的 plan 状态确定性路由原生 action；不引入 `ensure_goal`，也不匹配 host error text。固定 driver/consumer 可在 Goal mutation 紧前方读取 snapshot 以跳过已满足的目标状态
- 不允许 Agent 判断当前或先前 Goal 状态，也不要求 Agent 重放或补偿先前的 Goal 状态转换；程序内幂等消费细节由 `codex-plan-mutations-use-fixed-code-mode-consumer.md` 唯一拥有
- use `setWhen = on_enter_process_active` so `plan write` / `prepare.requirements` guidance does not claim Goal mode ownership before execution actually starts
- when a plan moves into `process.wait` or `process.discussing`, Codex keeps the existing Progress projection and emits `update_goal(status="blocked")` so Goal Mode stops without changing task projection
- when a later mutation resumes execution into `process.active`, emit `create_goal` according to the existing active-entry contract; no Progress-specific pause state is introduced
- treat `claw subplan create` as a focus handoff, not a Goal handoff: retain the root-plan Goal, project child tasks as Progress, and ensure every later child reconciliation uses the root-plan objective if the Host Goal is missing
- on every `end.*` status, clear Progress with the driver-recognized `:clear_progress` `update_plan({ plan: [] })`, then complete the root Goal; this covers `end.completed`, `end.closed`, and `end.leave`
- if `plan.goal.text` is missing, block the lifecycle from entering `process.active` instead of emitting a premature Goal mode recommendation
- generated task detail is derived from program state, not inferred from prose: the default Codex/no-host path appends `Follow the claw workflow guidance and finish your goal: <planGoal>` when `goalMode` is enabled, explicit `host: "opencode"` preserves its host-specific activation detail, and disabled `goalMode` keeps only the base activation detail

## Alternatives

- Promote the focused child plan's `goal.text` when a subplan is active. Rejected because focus is an execution view and would replace the thread objective during recovery.
- Persist a copied root-goal or goal-owner field in child plans or the session registry. Rejected because it creates a second editable source of truth that can drift from root `plan.json`.
- Treat subplan creation as a complete-and-create Goal handoff. Rejected because it mutates an otherwise valid root Goal and relies on Host lifecycle behavior rather than the canonical owner.

## Consequences

- The integration is honest about the host boundary.
- Goal Mode remains policy-controlled, while every nonempty Codex process plan has a visible Progress projection.
- Active execution can still align with Goal mode automatically in tool-capable environments.
- Goal lifecycle changes are expressed through real Codex contracts, not adapter-invented pseudo-operations.
- The same plan remains portable across hosts, because the canonical source stays in `.claw`, while Goal mode remains an optional Codex-host enhancement.
- Goal mode no longer competes with requirements collection; agents finish filling `goal.text`, `requirements`, `tasks`, and related fields before active execution begins.
- `goalMode` emission becomes a one-time activation boundary on first `process.active` entry, instead of a repeated `plan write` side effect.
- resumed active execution requests a Goal in the resume mutation call；如果旧 Goal 仍 active，固定 consumer 复用它而不再次创建。修复前 `0.1.86` installed Host 反例仍是历史证据，当前 worktree 的程序行为与未完成的真实 Host 发布验收见 `../features/codex-goal-mode-integration.md`。
- subplan creation no longer overwrites an unfinished parent Goal or relies on a failing `create_goal` as control flow; subplan focus keeps the root Goal, while child progress remains a separate projection.
- paused execution has a durable, testable target rule: Goal is blocked while Progress remains visible and unchanged; this preserves the canonical pause without inventing a paused Progress status.
- terminal execution has a durable, testable target rule: every `end.*` clears Progress and completes the root Goal, while compact terminal guidance must not ask the caller to repeat actions already consumed by the fixed driver.
- Goal 恢复成为 plan-status router 的程序合同；Agent 不再承担 Goal 状态探测、错误文本匹配、历史判断或状态重放责任。
- 发布前必须用未发布的本地构建做真实 Host wait→active lifecycle 验收，确认 wait 后 Goal 为空、resume 后新 Goal 跨调用保持 active。
- The default template activation detail no longer depends on agent-side interpretation of Goal Mode prose, which keeps Codex and opencode output aligned with their respective host contracts.
- `0.1.75` 的 `plan.wait` / `plan.resume` 真实验收把“先关闭、跨调用再重建”建立为回归样本；`0.1.86` 的反例促成了 v5 程序内幂等消费，并要求发布验收同时观察 wait 后 Goal 状态与 resume 后 active Goal，不能把聚焦测试或旧成功样本表述为新的 Host 实测保证。

## Related Code

- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/codex-driver.ts`
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

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-08-26 -->
### Separate Progress from paused Goal Mode

Codex now preserves Progress in `process.wait` and `process.discussing`, blocks Goal Mode in those states, and clears Progress plus completes Goal for every `end.*` state. This replaces the former complete-on-pause routing.

<!-- dated: 2026-07-17 -->
### 实测补充

`0.1.75` 指定完成 plan 的真实验收记录确认：`plan.wait` 返回 `update_goal(status="complete")`，后续 `plan.resume` 返回 `create_goal`；两步分属不同 mutation call，未要求 Agent 读取 Goal 状态或解释 `goalTool`。该段是版本化成功证据；后续偏差与当前 worktree 修复见 `../features/codex-goal-mode-integration.md`。
