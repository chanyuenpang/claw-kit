---
name: using-claw-kit
description: Use first whenever the claw-kit DSH adapter is enabled or its start prompt is present; check your available tools and follow the claw_run execution route.
---

# Using claw-kit in DSH

Use this skill first whenever the claw-kit DSH adapter is mounted (the
`claw_run` tool is present) or the session-start snapshot carries a
`[claw workflow]` block.

## Availability boundary

If claw-kit, its CLI, or the `claw_run` tool is unavailable, skip claw-kit and
continue the user's task directly. Do not claim that the task cannot proceed
solely because claw-kit is unavailable.

> claw kit 并不是任何任务的前置条件，不允许声称 claw kit 不可用而无法推进任务。

## Canonical state

- `.claw/` 下的 plan/task/subplan 文件是唯一真相。
- DSH 的 Goal 与进度投影都是投影：`claw_run` 自动消费 CLI 生成的 hostActions
  （`create_goal`/`update_goal` → DSH 原生 Goal，`update_plan` → 进度投影），
  **模型不需要也不应该操作 Goal 工具或维护并行任务列表**。
- 会话身份与 workspace 由 adapter 从调用 agent 锻造——不要传 session、host 或
  workdir 参数。

## First Action

1. 若请求不预期产生可复用的项目知识，跳过本 skill 直接工作。
2. 否则读取 session-start 注入的 `[claw workflow]` 快照（无快照时可用
   `claw_run` 的 `context` 或 `plan.show` 恢复）。
3. 有绑定计划时按快照的 stage/nextTask 继续，除非当前请求明确改变目标。

## Execution route: the claw_run tool

DSH 只有一条执行路线：**所有工作流操作都通过 `claw_run`**。

- `claw_run` 参数：`operation`（点号形式）+ `args`（snake_case 字段）。
- guidance 返回的 `commandHints` 与 `claw_run` 参数一一对应。
- **不要用 pwsh/shell 直接执行 claw CLI**：daemon 会话与 hostActions 消费由
  adapter 管理，绕过 `claw_run` 会丢失会话绑定与自动投影。
- 常用操作：

  | 操作 | 参数 | 用途 |
  | --- | --- | --- |
  | `plan.create` | `title`, `goal`, `scope`("session") | 建计划（discussing 起步） |
  | `plan.start` | `requirements`, `acceptance`[], `add_tasks`[] | 进入执行 |
  | `task.done` | `id` 或 `tasks`[] | 完成任务 |
  | `plan.done` | `retrospective`, `key_decision` | 关闭计划 |
  | `plan.show` | `simple` | 查看当前计划 |
  | `plan.wait` / `plan.resume` | — | 暂停 / 恢复 |
  | `search` | `query` | 项目记忆/知识召回 |
  | `context` | — | 恢复工作流上下文 |

## Planning stance

Treat claw-kit as an assistive workflow tool. Plans and tasks focus attention
and preserve progress; they are not immutable authority. Adjust goal, scope,
and task breakdown promptly when user needs or new evidence require it. When
an independently manageable scope would keep expanding a parent task, create a
subplan instead.

## Lifecycle

- `process.discussing`: 澄清需求，不提前实施；必要时用 `ask_user_question`。
- `process.active`: 一次执行一个任务，保持计划状态最新；每完成一个任务用
  `task.done`（前一条 assistant 消息里给出证据支撑的结论）。
- `process.wait`: 停止，等待用户或依赖恢复；不要自动推进。
- `end.*`: 执行要求的 closeout（`plan.done`），不要自动继续。

## Completion

1. 全部任务完成 → `plan.done`（project 作用域需 `retrospective`）。
2. 不要为完成状态额外创建 Goal 或并行任务清单。
