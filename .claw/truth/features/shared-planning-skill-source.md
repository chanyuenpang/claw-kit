# Shared Planning Skill Source

## 状态

这是 `claw-kit` 当前工作流的稳定事实。

## 核心事实

- `planning` 现在按单一源码维护，规范源文件位于 `shared/skills/planning/SKILL.md`。
- `packages/codex-adapter/skills/planning/SKILL.md` 与 `packages/opencode-adapter/skills/planning/SKILL.md` 不再各自独立维护；它们是由共享源同步生成的副本，并带有 `AUTO-GENERATED` 标记。
- `scripts/sync-planning-skill.mjs` 负责把共享源同步到两个适配器目录。
- `scripts/codex-plugin-bundle.mjs` 与 `scripts/opencode-plugin-bundle.mjs` 在读取插件源之前都会先执行 `syncPlanningSkill()`，因此导出或安装插件时会自动带上最新的共享 planning skill。
- `packages/codex-adapter/package.json` 与 `packages/opencode-adapter/package.json` 的 `build` / `check` 也会先执行同步脚本，避免仓库中的副本与共享源漂移。
- 共享后的 `planning` skill 保持宿主无关：它只描述如何产出高质量 plan 内容，不承担 claw-kit runtime、status 语义、writer dispatch、goal mode 或 closeout 规则。
- claw-kit 专属运行时语义继续保留在 `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 中，而不是重新回流到通用 `planning` skill。

## 影响

- 以后修改 planning skill 时，只需要编辑 `shared/skills/planning/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- planning 文案可以继续朝“通用 plan skill”演化，而宿主差异与 claw-kit 专属合同应继续收敛到 `using-claw-kit` 或其他宿主级入口技能中。
- 插件打包、安装和适配器构建不再依赖人工记忆去手动同步两份 planning 副本。

## 证据

- `shared/skills/planning/SKILL.md`
- `scripts/sync-planning-skill.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `packages/codex-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
