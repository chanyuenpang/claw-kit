# Codex plugin workflow mechanics

## Status

Accepted working truth for the current Codex adapter workflow surface.

## Core facts

- `using-claw-kit` 的可见入口合同是 router-first 且 entry-owned：先沿着已恢复的 `.claw` workflowGuidance 或当前 active task 继续；只有在不存在 task scope，且请求预期产生可复用事实、决策、约束、模式或项目上下文时，才走 `claw plan create`。
- `planning` 仍然是可见的 plan-entry skill，但它是由 `claw plan create` 之后种下的 planning task 调起的，不应该被插件 manifest 或 startup prompt 预读成前置工作流步骤。
- 不预期产生可复用知识的请求在 `using-claw-kit` 入口处直接绕过正式 claw workflow：不会先跑 `claw search`，不会触发 `claw plan create`，也不会收到 `workflowGuidance`。
- 已创建的 plan 可以稳定、跨轮次停留在 `process.discussing`；plan 存在本身不构成进入 Goal Mode 或 `process.active` 的理由。
- 只有后续可执行子任务已经明确，并且用户可以脱手让 agent 继续推进时，plan 才从 `process.discussing` 进入 `process.active` 并激活 Goal Mode。
- `planning` 负责需求澄清、任务拆分和 plan 质量；`using-claw-kit` 负责 claw runtime 路由、状态切换和 goal mode。知识沉淀由 hook-owned finalizer 独立运行 `knowledge-writer`，不属于 main-agent workflow dispatch。
- `researcher` 是项目调查角色；`knowledge-writer` 是完成计划后的 consistency-aware stewardship workflow，不是主线程可复用 specialist，也不得由 main agent 另行派发。
- `direct` 仍然只是一个隐藏的兼容命令，不应被提升成公开 workflow 概念；轻量请求的默认入口语义是“在 session entry 处直接绕过 claw workflow”，而不是先进入 planning / default plan-create。
- When retargeting installed converted skill templates between plugin surfaces, clear competing global templates and duplicate cache copies first so skill-local template resolution sees only one matching source.

## Implications

- 未来的 workflow 文案应该继续把 `claw plan create` 作为正式 claw workflow 的唯一正常 task-scope 入口，而不是在 startup surface 上并列多个入口；但同时要保留“不预期产生可复用知识的请求可在入口处不进入该流程”的边界说明。
- specialist 语义应保持稳定：planning 负责把任务想清楚，researcher 负责调查；hook-owned `knowledge-writer` 负责完成后的 Truth/ADR 一致性维护，不能折叠回 main-agent closeout dispatch。
- 当需要解释轻量路径时，应该强调它是 `using-claw-kit` 的入口门禁结果，而不是新的用户可见 workflow 层级；`direct` 只保留为兼容性分支。

## Evidence

- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/opencode-adapter/skills/using-claw-kit/SKILL.md`
- `packages/codex-adapter/.codex-plugin/plugin.json`
- `shared/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/knowledge-writer/`
- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/opencode-adapter/agents/claw-knowledge-writer.md`
- `packages/opencode-adapter/agents/claw-researcher.md`
- `packages/core/src/templates/plans/default.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `scripts/codex-plugin-bundle.test.mjs`
