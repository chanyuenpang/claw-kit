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
## 2026-07-13：staging-only 导出与 update skill 审计

- `planning` 与 `config` 的规范源仍然只在 `shared/skills/`；适配器副本不应作为 Git 追踪文件或日常编辑入口。
- `scripts/codex-plugin-bundle.mjs` 和 `scripts/opencode-plugin-bundle.mjs` 现在应在临时 staging 目录内生成所需的 adapter-local skill 副本，再把最终 payload 写入安装缓存；本地插件安装、adapter `build`、`check` 不应覆写仓库中的 `packages/*-adapter/skills/**/SKILL.md`。
- 当时针对 `update` 的仓库、已安装 Codex plugin cache 和用户 skill 目录审计未发现真实 skill；该历史结论已被 `0.1.62` 后续发布取代。当前规范源是 `shared/skills/update/`，Codex bundle 和已安装 cache 都会携带 `SKILL.md`、`TEMPLATE.json` 与相关资源。
- 发布版本必须先以 npm registry 的 `latest` 为准，而不是以 workspace 旧版本或 runtime hint 为准。审计时 `@veewo/claw-core` 与 `@veewo/claw` 的 `latest` 都是 `0.1.60`，所以下一轮 patch release 的目标是 `0.1.61`。

## 补充检索词

- `staging-only shared skills`
- `update skill`
- `registry latest 0.1.60`
- `release target 0.1.61`

## 2026-07-14：统一 plan template 解析与实例化

### 结论

- `claw plan create` 与 `claw subplan create` 现在共用单一模板解析流程。两条入口最终都进入 `packages/core/src/plan.ts` 的 `writePlan(...)`，再统一通过 `createPlanFromTemplate(...) -> resolvePlanTemplate(...)` 完成模板发现、schema 判别和实例化。
- `packages/core/src/plan-templates.ts` 的 `resolvePlanTemplate(...)` 同时兼容 built-in / project legacy `SeedPlanTemplate`，以及 skill-local `TEMPLATE.json` 提供的 full `PlanDocument` template。候选 skill roots 统一来自显式 `CLAW_SKILL_ROOTS`、当前项目 `shared/skills`、源码 checkout 的 `shared/skills`，以及 Codex / OpenCode 对应的 host 安装面；这些只是同一个 resolver 的发现来源，不是不同 create 流程。
- `subplan` 的唯一额外行为发生在统一实例化之后：写入 `parentPlan` / `parentTaskId`，合并父计划的 rules / references，并把父任务的 `execution.type`、`execution.subplan`、`execution.planPath` 更新为 child plan linkage；父任务原为 `pending` 时同时转为 `in_progress`。

### 长期行为 / 规则

- full template 的 `configOverride` 会进入 `effectivePlanProjectConfig(...)`，从而影响运行时 `workflowGuidance`；不能把它当作仅用于生成静态 JSON 的元数据。
- full template task 的 `guidance.onDone` 会参与任务完成时的 guidance 合并；若 task 定义 choices，CLI `plan edit --choice-id <id>` 会选择对应分支，所选分支的 `summary` 等字段进入运行时响应。
- CLI compact plan response 必须保留 `workflowGuidance.summary`，并继续以顶层 `summary` 返回；不能只保留 `nextsteps`、`recommendedCommands` 或折叠后的 `planSummary`。
- `shared/skills/update/TEMPLATE.json` 是 full `PlanDocument` template；它不需要被改写成 legacy `SeedPlanTemplate`，也不应为 `plan create` 与 `subplan create` 分别建立专用 resolver。

### 真实调用链路

- root plan：CLI `plan create` -> `writePlan(...)` -> `createPlanFromTemplate(...)` -> `resolvePlanTemplate(...)` -> seed/full template 实例化。
- child plan：CLI `subplan create` -> `createSubplan(...)` -> `writePlan(...)` -> 同一 `createPlanFromTemplate(...)` / `resolvePlanTemplate(...)` 链路 -> 统一实例化后补 parent linkage 并更新父任务 execution。

### 验证标准

- 全仓 `npm run check` 通过。
- Core 测试：90/90 通过。
- CLI 测试：56/56 通过。
- Codex bundle 测试：6/6 通过。
- OpenCode bundle 测试：5/5 通过。
- 隔离 live smoke 使用本地构建 CLI 与 canonical `shared/skills/update/TEMPLATE.json`：`plan create --template update` 与 `subplan create --template update` 均生成 `process.active`、3 tasks 的 plan；child 明确记录 `parentPlan = plan.json`、`parentTaskId = 1`。
- 同一 smoke 中，`plan edit ... --choice-id codex` 返回 `summary = The current host route is Codex.` 和 `nextTask = 2`，证明 full template 的 task `guidance.onDone`、choice 分支和 compact summary 都进入真实运行时响应。

### 关联代码

- `shared/skills/update/SKILL.md`
- `shared/skills/update/TEMPLATE.json`
- `packages/core/src/plan.ts`
- `packages/core/src/plan-templates.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/types.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `packages/core/src/templates/plans/default.ts`

### 补充检索词

- `writePlan resolvePlanTemplate`
- `FullPlanTemplate`
- `SeedPlanTemplate`
- `skill-local TEMPLATE.json`
- `CLAW_SKILL_ROOTS shared/skills`
- `guidance.onDone choiceId`
- `workflowGuidance.summary`
