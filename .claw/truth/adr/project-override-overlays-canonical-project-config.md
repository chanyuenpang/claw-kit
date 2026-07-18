# ADR: `project-override.json` overlays canonical project config at runtime

## Status

Accepted

## Context

这轮 `project-override-and-workflow-toggles` plan 需要同时解决两类长期约束：

- 项目级 workflow 行为需要进入 canonical `.claw/project.json` schema，而不是继续停留在 prompt 侧约定。
- 个人本地覆盖需要有正式入口，但不能把用户私有状态回写到团队共享的 `.claw/project.json`。

现有 ADR 已经确认 `.claw/project.json` 是项目级配置的 canonical 声明面，`claw init` / protocol repair 继续拥有 team-facing 配置物的修复职责。本轮工作在这个边界上继续推进，新增了 workflow toggles 与 personal overlay 的长期语义。

`Publish-claw-kit-release-and-refresh-local-Codex-plugin` closeout 进一步确认了这个边界的兼容性要求：旧项目里的 nested workflow / GitNexus shape 仍要被接受，但修复后的 committed config 必须回到扁平 canonical fields，同时默认 vector store 配置不能因为 repair 而重新物化进 `.claw/project.json`。

## Decision

- 把项目级 workflow 行为纳入 canonical `.claw/project.json` schema。
- `goalMode` 的 canonical 默认值是 `true`。
- 简单 project-level toggles 使用扁平字段；旧的 nested `workflow.*`、`workflow.truthDispatch.mode` 与 `gitnexus.enabled` 只属于 legacy compatibility input。
- project config repair 必须把 legacy shape 规范化为当前 canonical fields：`planning`、`externalPlanningSkill`、`goalMode`、`knowledgeWriter` 与 `gitnexus`。`truthDispatch` 不再是 current project schema owner。
- `.claw/project-override.json` 是完整的 personal overlay，可以覆盖 `.claw/project.json` 的任意字段，而不是只服务某个临时特例；其中 workflow / GitNexus 类简单开关应使用与 team config 相同的扁平 canonical 字段。
- runtime project resolution 读取并 deep-merge `.claw/project-override.json` 覆盖 canonical `.claw/project.json`。
- `.claw/project-override.json` 里的显式 `null` 是真实 override 值，不表示回退到 team config。
- 只有 runtime project resolution 消费 `.claw/project-override.json`；canonical protocol repair 和 `claw init` 继续只拥有 team-facing `.claw/project.json`。
- default vector indexing 可以保持 runtime-enabled，但 protocol repair 不能仅因默认值就把 `memory.embedding.store.vector.enabled = true` 写回 `.claw/project.json`；`store.vector` 只在显式 `enabled: false` 或 `extensionPath` 有意义时保留。
- 当 effective config 设置 `goalMode=false` 时，workflow guidance 不再返回 `goalMode`。
- Knowledge finalization 不由 project-level `truthDispatch` 或 workflow guidance delegation 控制；current writer configuration 由 `knowledgeWriter` object 和 hook-owned finalization job 快照拥有。

## Consequences

- workflow toggles 现在拥有稳定的项目级 schema，而不是散落在适配器提示词或 host 约定里。
- 团队共享配置与个人本地覆盖的职责边界清晰：`.claw/project.json` 继续 canonical，`.claw/project-override.json` 只在 runtime 生效。
- 用户可以只覆盖局部 config，而不必复制整份 `.claw/project.json`。
- 显式 `null` override 让 personal overlay 可以真正移除有效配置值，而不是被错误地解释为“未设置”。
- `claw init`、protocol repair 与 team-facing config normalization 不会把个人覆盖重新物化回 canonical 文件，也不会接管本地 overlay 生命周期。
- legacy-shape projects can be repaired without losing explicit behavior, while future diffs stop reintroducing nested workflow/GitNexus config or default-only vector store noise.
- workflow guidance 的 `goalMode` 受 effective project config 控制；knowledge writer 配置经 effective config 解析后在 job 创建时快照，不回流为 main-agent delegation。

## Related Code

- `.claw/tasks/project-override-and-workflow-toggles/plan.json`
- `.claw/tasks/Publish-claw-kit-release-and-refresh-local-Codex-plugin/plan.json`
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
