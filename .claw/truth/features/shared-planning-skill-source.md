# Shared Skill Sources

## 状态

这是 `claw-kit` 当前 host-neutral skill 维护方式的稳定事实。

## 核心事实

- `planning` 现在按单一源码维护，规范源文件位于 `shared/skills/planning/SKILL.md`。
- `config` 也按单一源码维护，规范源文件位于 `shared/skills/config/SKILL.md`。
- `packages/codex-adapter/skills/planning/SKILL.md`、`packages/opencode-adapter/skills/planning/SKILL.md`、`packages/codex-adapter/skills/config/SKILL.md`、`packages/opencode-adapter/skills/config/SKILL.md` 不再各自独立维护；它们是由共享源同步生成的副本，并带有 `AUTO-GENERATED` 标记。
- `scripts/sync-shared-skills.mjs` 负责把共享源同步到两个适配器目录。
- `scripts/sync-planning-skill.mjs` 仍保留为兼容 wrapper。
- `scripts/codex-plugin-bundle.mjs` 与 `scripts/opencode-plugin-bundle.mjs` 在读取插件源之前都会先执行 shared skill sync，因此导出或安装插件时会自动带上最新的共享 skills。
- `packages/codex-adapter/package.json` 与 `packages/opencode-adapter/package.json` 的 `build` / `check` 也会先执行共享同步脚本，避免仓库中的副本与共享源漂移。
- 共享后的 `planning` skill 保持宿主无关：它只描述如何产出高质量 plan 内容，不承担 claw-kit runtime、复杂度评分门禁、status 语义、writer dispatch、goal mode 或 closeout 规则。
- 共享后的 `config` skill 保持宿主无关：它只描述配置入口、team-vs-personal scope 判断、canonical field shape 和 override 格式，不承担 claw-kit lifecycle 或 writer dispatch。
- claw-kit 专属运行时语义继续保留在 `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 中，而不是重新回流到通用 shared skills；本轮已验证复杂度评分表与低分绕过规则都属于这个入口 skill，而不是 `shared/skills/planning/SKILL.md`。

## 影响

- 以后修改 planning skill 时，只需要编辑 `shared/skills/planning/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- 以后修改 config skill 时，只需要编辑 `shared/skills/config/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- planning 文案可以继续朝“通用 plan skill”演化，而宿主差异与 claw-kit 专属合同应继续收敛到 `using-claw-kit` 或其他宿主级入口技能中；如果未来再调整复杂度门禁或低复杂度绕过语义，应先改入口 skill，再同步生成副本，而不是把门禁写回 shared planning 源。
- config 文案提供明确配置入口：先判断 shared team config 还是 personal local override，再使用当前扁平 canonical field shape。
- 插件打包、安装和适配器构建不再依赖人工记忆去手动同步共享 skill 副本。

## 证据

- `shared/skills/planning/SKILL.md`
- `shared/skills/config/SKILL.md`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-planning-skill.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `packages/codex-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/config/SKILL.md`
- `packages/opencode-adapter/skills/config/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
