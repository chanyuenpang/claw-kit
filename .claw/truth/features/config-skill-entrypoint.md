# Config skill entrypoint

## 状态

Accepted working truth for the claw-kit plugin configuration surface.

## 核心事实

- `config` 是 claw-kit 的专用配置 skill，用于解释、检查或修改 claw-kit 配置。
- `config` 的第一步必须确认用户要修改的是 shared team config 还是 personal local config。
- shared team config 写入 `.claw/project.json`，这是 canonical team-owned declaration surface，适合提交到仓库。
- personal local config 写入 `.claw/project-override.json`，这是 gitignored runtime overlay，不应提交，也不应被描述成第二份 canonical config。
- `.claw/project-override.json` 使用与 `.claw/project.json` 相同的 canonical 字段格式，例如 `planning`、`externalPlanningSkill`、`goalMode`、`knowledgeWriter`、`gitnexus`；`knowledgeWriter` 保持有实际子结构的嵌套对象。
- legacy nested inputs such as `workflow.goalMode.enabled`, `workflow.truthDispatch.mode`, and `gitnexus.enabled` remain compatibility inputs for repair, but are not the recommended override format.
- `memory.embedding` remains nested because it has real provider/model substructure; default vector indexing is runtime-enabled, but default config examples and protocol repair must not persist `store.vector.enabled = true`.
- `store.vector` is retained only for explicit user intent: `enabled: false` to disable vector indexing, or `extensionPath` to point at a custom vector extension.
- `memory.enabled` is not a canonical config field.
- `config` skill 的共享源位于 `shared/skills/config/SKILL.md`，并同步生成到 Codex 和 OpenCode adapter skill directories。
- Local startup and closeout checks must verify actual global CLI/runtime file content, not only package versions, because stale same-version global runtime can rewrite `.claw/project.json` back to legacy nested config before repo-local repair flattens it again.

## 代码锚点

- `shared/skills/config/SKILL.md`
- `packages/codex-adapter/skills/config/SKILL.md`
- `packages/opencode-adapter/skills/config/SKILL.md`
- `scripts/sync-shared-skills.mjs`
- `docs/project-json-reference.md`
- `packages/codex-adapter/references/project-config-reference.md`
- `packages/opencode-adapter/references/project-config-reference.md`
- `scripts/codex-plugin-bundle.test.mjs`
- `scripts/opencode-plugin-bundle.test.mjs`
