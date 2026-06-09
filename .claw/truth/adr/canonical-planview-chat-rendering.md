# ADR: Canonical planView chat rendering

## Status

Superseded

Superseded by: `abandon-apps-sdk-widget-route.md`

## Context

`claw-kit` 需要在 Codex 对话中稳定展示当前计划，而不是让适配器重新解析原始 `plan.json` 后自行推导另一套显示状态。完成的 `codex-chat-rendering-smoke` 计划进一步确认了一条长期约束：`claw plan write`、`claw plan edit` 和 `claw plan done` 在计划发生变化后，都要立即返回同一套可见计划渲染结果，保证聊天窗口刷新后仍然看到与 CLI 一致的状态。

## Decision

将活动计划的聊天渲染固定为 `planView` 驱动的 Codex 路径：

- 读取当前可见状态时优先使用 `claw plan render --task <task>`
- 折叠摘要以 `render.collapsedText` / `planView.collapsedSummary` 为准
- Goal 保持默认折叠，作为次级 disclosure
- Tasks 顺序以 `planView.tasks.items` 和渲染结果为准，保持 `unfinished_first_stable`
- `claw plan write`、`claw plan edit`、`claw plan done` 在成功结果中直接附带可见 plan render，避免编辑后还要依赖额外刷新或重新派生状态
- 适配器与技能层不得从原始 `plan.json` 重新排序、重算摘要或维护平行显示模型

## Consequences

- Codex 聊天、线程进度镜像与 CLI 可见状态共享同一份规范数据，减少渲染漂移
- 计划编辑后的待办状态会立即出现在聊天渲染中，重启或刷新后仍保持稳定
- 后续如果扩展更丰富的宿主展示层，仍必须继续以 `planView` 和 `claw plan render` 作为上游契约

## Related Code

- `packages/core/src/plan-view.ts`
- `packages/core/src/plan.ts`
- `packages/cli/src/cli.ts`
- `packages/codex-adapter/skills/plan-chat-renderer/SKILL.md`
- `packages/codex-adapter/references/plan-view-consumption.md`
- `packages/codex-adapter/references/codex-host-surface-contract.md`

## Search Terms

- `planView`
- `claw plan render`
- `plan-chat-renderer`
- `collapsedSummary`
- `unfinished_first_stable`
