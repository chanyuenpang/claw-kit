# ADR: `project-override.json` overlays canonical project config at runtime

## Status

Accepted

## Context

这轮 `project-override-and-workflow-toggles` plan 需要同时解决两类长期约束：

- 项目级 workflow 行为需要进入 canonical `.claw/project.json` schema，而不是继续停留在 prompt 侧约定。
- 个人本地覆盖需要有正式入口，但不能把用户私有状态回写到团队共享的 `.claw/project.json`。

现有 ADR 已经确认 `.claw/project.json` 是项目级配置的 canonical 声明面，`claw init` / protocol repair 继续拥有 team-facing 配置物的修复职责。本轮工作在这个边界上继续推进，新增了 workflow toggles 与 personal overlay 的长期语义。

## Decision

- 把项目级 workflow 行为纳入 canonical `.claw/project.json` schema。
- `goalMode` 的 canonical 默认值是 `true`。
- `truthDispatch` 的 canonical 默认值是 `per_task`。
- 简单 project-level toggles 使用扁平字段；`workflow.goalMode.enabled`、`workflow.truthDispatch.mode`、`gitnexus.enabled` 只作为 legacy compatibility input 被读取和修复。
- `.claw/project-override.json` 是完整的 personal overlay，可以覆盖 `.claw/project.json` 的任意字段，而不是只服务某个临时特例；其中 workflow / GitNexus 类简单开关应使用与 team config 相同的扁平 canonical 字段。
- runtime project resolution 读取并 deep-merge `.claw/project-override.json` 覆盖 canonical `.claw/project.json`。
- `.claw/project-override.json` 里的显式 `null` 是真实 override 值，不表示回退到 team config。
- 只有 runtime project resolution 消费 `.claw/project-override.json`；canonical protocol repair 和 `claw init` 继续只拥有 team-facing `.claw/project.json`。
- 当 effective config 设置 `goalMode=false` 时，workflow guidance 不再返回 `goalMode`。
- 当 effective config 设置 `truthDispatch=final_only` 时，workflow guidance 不再返回 mid-task `truth-writer` delegation，但完成期沉淀仍然保留。

## Consequences

- workflow toggles 现在拥有稳定的项目级 schema，而不是散落在适配器提示词或 host 约定里。
- 团队共享配置与个人本地覆盖的职责边界清晰：`.claw/project.json` 继续 canonical，`.claw/project-override.json` 只在 runtime 生效。
- 用户可以只覆盖局部 config，而不必复制整份 `.claw/project.json`。
- 显式 `null` override 让 personal overlay 可以真正移除有效配置值，而不是被错误地解释为“未设置”。
- `claw init`、protocol repair 与 team-facing config normalization 不会把个人覆盖重新物化回 canonical 文件，也不会接管本地 overlay 生命周期。
- workflow guidance 的 `goalMode` 与 `truth-writer` delegation 现在都受 effective project config 控制，同时仍与既有完成期沉淀流程兼容。

## Related Code

- `.claw/tasks/project-override-and-workflow-toggles/plan.json`
- `packages/core/src/types.ts`
- `packages/core/src/context.ts`
- `packages/core/src/project-check.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/core/src/init.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`

## Search Terms

- `project-override.json`
- `project.json`
- `explicit null override`
- `goalMode`
- `truthDispatch`
- `gitnexus`
- `final_only`
- `per_task`
