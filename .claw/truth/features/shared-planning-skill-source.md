# Shared Skill Sources

## 状态

这是 `claw-kit` 当前 host-neutral skill 维护方式的稳定事实。

## 核心事实

- `planning` 现在按单一源码维护，规范源文件位于 `shared/skills/planning/SKILL.md`。
- `config` 也按单一源码维护，规范源文件位于 `shared/skills/config/SKILL.md`。
- `create-claw-skill` 也按单一源码维护，规范源文件位于 `shared/skills/create-claw-skill/SKILL.md`。
- `packages/codex-adapter/skills/planning/SKILL.md`、`packages/opencode-adapter/skills/planning/SKILL.md`、`packages/codex-adapter/skills/config/SKILL.md`、`packages/opencode-adapter/skills/config/SKILL.md` 不再各自独立维护；它们是由共享源同步生成的副本，并带有 `AUTO-GENERATED` 标记。
- `packages/codex-adapter/skills/create-claw-skill/SKILL.md`、`packages/opencode-adapter/skills/create-claw-skill/SKILL.md` 同样是共享源同步生成的副本；它们的 shared source 只需维护 `shared/skills/create-claw-skill/SKILL.md`。
- `scripts/sync-shared-skills.mjs` 负责把共享源同步到两个适配器目录，并按技能目录整体复制受维护的 shared skill tree。
- `scripts/sync-planning-skill.mjs` 仍保留为兼容 wrapper。
- `scripts/codex-plugin-bundle.mjs` 与 `scripts/opencode-plugin-bundle.mjs` 在读取插件源之前都会先执行 shared skill sync，因此导出或安装插件时会自动带上最新的共享 skills。
- `packages/codex-adapter/package.json` 与 `packages/opencode-adapter/package.json` 的 `build` / `check` 也会先执行共享同步脚本，避免仓库中的副本与共享源漂移。
- `scripts/sync-shared-skills.mjs` 只会把生成 banner 注入到顶层 `SKILL.md`，不会污染 shared skill tree 里的其他 markdown 或 bundled helper scripts。
- `scripts/sync-shared-skills.mjs` 现在用 repo lock 保护共享 skill 同步，`scripts/sync-shared-skills.test.mjs` 则覆盖了同步结果、生成 banner 和 Windows 并发打包场景，避免 `codex-plugin-bundle` 与 `opencode-plugin-bundle` 测试在同一工作区里互相抢写。
- 共享后的 `planning` skill 保持宿主无关：它只描述如何产出高质量 plan 内容，不承担 claw-kit runtime、复杂度评分门禁、status 语义、writer dispatch、goal mode 或 closeout 规则。
- 共享后的 `config` skill 保持宿主无关：它只描述配置入口、team-vs-personal scope 判断、canonical field shape 和 override 格式，不承担 claw-kit lifecycle 或 writer dispatch。
- 共享后的 `create-claw-skill` skill 保持宿主无关：它只负责把既有 skill 或用户想法转换成 claw-template-backed skill，不承担 claw-kit runtime、复杂度评分门禁、status 语义、writer dispatch、goal mode 或 closeout 规则。
- 为了避免把试验性产物误固化成长期合同，`brainstorming` 和 `systematic-debugging` 这类在创建 `create-claw-skill` 过程中生成的测试 skill 树不应作为正式 shared skills/templates 保留在仓库里；它们不属于 `scripts/sync-shared-skills.mjs` 的默认维护列表，除非未来被明确重新晋升。
- claw-kit 专属运行时语义继续保留在 `packages/codex-adapter/skills/using-claw-kit/SKILL.md` 中，而不是重新回流到通用 shared skills；本轮已验证复杂度评分表与低分绕过规则都属于这个入口 skill，而不是 `shared/skills/planning/SKILL.md`。

## 影响

- 以后修改 planning skill 时，只需要编辑 `shared/skills/planning/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- 以后修改 config skill 时，只需要编辑 `shared/skills/config/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- 以后修改 create-claw-skill skill 时，只需要编辑 `shared/skills/create-claw-skill/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- planning 文案可以继续朝“通用 plan skill”演化，而宿主差异与 claw-kit 专属合同应继续收敛到 `using-claw-kit` 或其他宿主级入口技能中；如果未来再调整复杂度门禁或低复杂度绕过语义，应先改入口 skill，再同步生成副本，而不是把门禁写回 shared planning 源。
- config 文案提供明确配置入口：先判断 shared team config 还是 personal local override，再使用当前扁平 canonical field shape。
- create-claw-skill 文案继续承担模板化转换入口：如果未来要调整转换流程或 fallback 语义，先改 shared source，再让 sync 脚本和插件 bundle 传播到适配器目录。
- 生成型测试 skill 默认不进入 shared sync 列表；如果未来要重新引入 `brainstorming` 或 `systematic-debugging`，应先明确它们是否要晋升为正式 shared skills/templates，再决定是否纳入同步。
- 插件打包、安装和适配器构建不再依赖人工记忆去手动同步共享 skill 副本。

## 证据

- `shared/skills/planning/SKILL.md`
- `shared/skills/config/SKILL.md`
- `shared/skills/create-claw-skill/SKILL.md`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-planning-skill.mjs`
- `scripts/sync-shared-skills.test.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `packages/codex-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/config/SKILL.md`
- `packages/opencode-adapter/skills/config/SKILL.md`
- `packages/codex-adapter/skills/create-claw-skill/SKILL.md`
- `packages/opencode-adapter/skills/create-claw-skill/SKILL.md`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
