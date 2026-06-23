# Codex plugin workflow mechanics

## Status

Accepted working truth for the current Codex adapter workflow surface.

## Core facts

- `using-claw-kit` 的可见入口合同是 router-first：先沿着已恢复的 `.claw` workflowGuidance 或当前 active task 继续；只有在不存在 task scope 时，才走新的 `claw plan create`。
- `planning` 仍然是可见的 plan-entry skill，但它是由 `claw plan create` 之后种下的 planning task 调起的，不应该被插件 manifest 或 startup prompt 预读成前置工作流步骤。
- `planning` 负责需求澄清、任务拆分和 plan 质量；`using-claw-kit` 负责 claw runtime 路由、状态切换、goal mode 和 writer dispatch；两者的职责边界应继续保持分离。
- `truth-writer`、`adr-writer`、`researcher` 都是可复用的专门角色，不是一次性派发对象；同线程已有合适 specialist 时应优先复用，而不是为了新的沉淀重复创建。
- `direct` 仍然只是一个隐藏的兼容命令，不应被提升成公开 workflow 概念；普通轻量工作应继续覆盖在 planning / default plan-create 路径里。

## Implications

- 未来的 workflow 文案应该继续把 `claw plan create` 作为唯一正常的 task-scope 入口，而不是在 startup surface 上并列多个入口。
- specialist 语义应保持稳定：planning 负责把任务想清楚，writer / researcher 负责把已完成的结论或调查沉淀好，不应把这些角色折叠回主 agent 的一次性说明。
- 当需要解释轻量路径时，应该继续把 `direct` 视作兼容性分支，而不是新的用户可见 workflow 层级。

## Evidence

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `shared/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/truth-writer/SKILL.md`
- `packages/codex-adapter/skills/adr-writer/SKILL.md`
- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/opencode-adapter/agents/claw-truth-writer.md`
- `packages/opencode-adapter/agents/claw-adr-writer.md`
- `packages/opencode-adapter/agents/claw-researcher.md`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `scripts/codex-plugin-bundle.test.mjs`