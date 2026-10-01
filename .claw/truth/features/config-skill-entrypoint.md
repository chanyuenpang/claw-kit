# Config skill entrypoint

<!-- state: current -->
## Current behavior

- `config` 是 claw-kit 的专用配置 skill，用于解释、检查或修改 claw-kit 配置。
- `config` 的第一步必须确认用户要修改的是 shared team config 还是 personal local config。
- shared team config 写入 `.claw/project.json`，这是 canonical team-owned declaration surface，适合提交到仓库。
- personal local config 写入 `.claw/project-override.json`，这是 gitignored runtime overlay，不应提交，也不应被描述成第二份 canonical config。
- `.claw/project-override.json` 使用与 `.claw/project.json` 相同的 canonical 字段格式，例如 `planning`、`externalPlanningSkill`、`goalMode`、`knowledgeWriter`、`gitnexus`；`knowledgeWriter` 保持有实际子结构的嵌套对象。
- legacy nested inputs such as `workflow.goalMode.enabled`, `workflow.truthDispatch.mode`, and `gitnexus.enabled` remain compatibility inputs for repair, but are not the recommended override format.
- `memory.embedding` remains nested because it has real provider/model substructure; default vector indexing is runtime-enabled, but default config examples and protocol repair must not persist `store.vector.enabled = true`.
- `store.vector` is retained only for explicit user intent: `enabled: false` to disable vector indexing, or `extensionPath` to point at a custom vector extension.
- `memory.enabled` is not a canonical config field.
- config 的源码与整包分发由 [shared-source Truth](<shared-planning-skill-source.md>) 统一拥有；本文只拥有配置入口。

## 代码锚点

- [config source](<../../../.agents/skills/config/SKILL.md>)
- `docs/project-json-reference.md`
- `packages/codex-adapter/references/project-config-reference.md`
- `packages/opencode-adapter/references/project-config-reference.md`
- `scripts/codex-plugin-bundle.test.mjs`
- `scripts/opencode-plugin-bundle.test.mjs`
