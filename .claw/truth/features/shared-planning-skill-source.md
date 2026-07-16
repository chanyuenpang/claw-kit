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

## 2026-07-15：官方 Codex marketplace 源物化与模板 resolver 收敛

### 结论

- Codex 官方 Git marketplace 直接缓存仓库 marketplace manifest 中 `source` 指向的插件树；仓库入口是 `.agents/plugins/marketplace.json`，其中 `claw-kit` 使用 `source.source = "local"`、`source.path = "./packages/codex-adapter"`。安装期不依赖 npm lifecycle，也不应要求用户运行仓库脚本补齐插件内容。
- `shared/skills/` 仍是跨适配器共享内容的规范源；但作为官方 marketplace 安装源的 `packages/codex-adapter/` 必须在 Git 中提交已物化的 `planning`、`config`、`update`、`create-claw-skill` 及各自全部模板、helper 和其他资源。Codex 专属 skills 与这四个共享 skills 共同组成自包含插件树。
- `scripts/sync-shared-skills.mjs` 现在同时提供 `verifySharedSkillsSynced(...)` 与 `assertSharedSkillsSynced(...)` 只读校验。发布门禁在 marketplace 源缺少共享 skill 或内容漂移时直接失败；`scripts/codex-plugin-bundle.mjs` 导出时不再隐式同步来掩盖源目录缺失。
- `scripts/codex-plugin-bundle.test.mjs` 的 marketplace-style cache copy 测试从真实 `packages/codex-adapter` 源树复制到临时版本化 cache，并验证四个共享 skills 以及 template / helper 资源齐全。这一验证与 release zip 验证是两个不同发布面。
- 当前模板统一入口是 `packages/core/src/plan-templates.ts` 的 `resolveSeedPlanTemplate(...)`。`claw plan create`、`claw subplan create` 与 `claw template validate` 都复用该 resolver；此前文档中的 `resolvePlanTemplate(...)` / 分离式解析描述已被这一当前实现取代。
- `claw template validate` 除模板有效性外，还输出 `choiceRequiredTasks`，用于暴露哪些 task 在完成时要求 `choice-id`。
- 合并远端后的统一版本线是 `0.1.63`：root、core、CLI、Codex adapter、OpenClaw adapter 与 OpenCode adapter 的 package version 均对齐到 `0.1.63`。

### 长期行为 / 规则

- 官方 marketplace 源必须是已提交、自包含、可直接复制的插件树；不能以“bundle 导出时能够生成完整 payload”替代对 `packages/codex-adapter` 源树完整性的验证。
- 共享内容的维护入口仍是 `shared/skills/`，但每次共享 skill 或资源变更后，必须同步更新并提交 marketplace 源中的物化副本，再由只读 verify/assert 检查缺失与漂移。
- release gate 必须同时验证 `.agents/plugins/marketplace.json` 的 source 路由、物化源树与 shared source 一致，以及 bundle / isolated template 可用性；任何一个发布面失败都不能发布。
- 用户安装与升级 Codex 插件的规范路径是 `codex plugin marketplace add chanyuenpang/claw-kit --ref main` 和 `codex plugin marketplace upgrade claw-kit`，随后在 Codex 插件目录中安装或刷新 Claw Kit。直接写入本机 plugin cache 的安装脚本只用于维护者本地开发，不是远端用户分发入口。
- plan create、subplan create 与 template validate 的模板语义必须继续由同一个 `resolveSeedPlanTemplate(...)` 决定，避免创建路径与校验路径对同一模板给出不同结论。

### 验证标准

- `.agents/plugins/marketplace.json` 中 `claw-kit` 的 source 精确指向 `./packages/codex-adapter`。
- `verifySharedSkillsSynced(...)` 对缺失或漂移只报告失败、不改写文件；`assertSharedSkillsSynced(...)` 在 release gate 中把该结果升级为硬失败。
- marketplace-style cache copy 后，cache 的 `skills/` 同时包含 `planning`、`config`、`update`、`create-claw-skill`，且 `TEMPLATE.json`、helper 与其他声明资源仍在。
- `claw plan create`、`claw subplan create` 和具名 `claw template validate` 对相同模板走同一 resolver；validate 响应包含 `choiceRequiredTasks`。
- release version audit 同时核对 root 与所有 adapter/package version 为 `0.1.63`。

### 关联代码

- marketplace 入口：`.agents/plugins/marketplace.json`
- 共享内容源：`shared/skills/`
- 已物化 Codex 插件源：`packages/codex-adapter/skills/`
- 只读同步校验：`scripts/sync-shared-skills.mjs`
- Codex bundle 导出：`scripts/codex-plugin-bundle.mjs`
- marketplace cache copy 测试：`scripts/codex-plugin-bundle.test.mjs`
- release gate：`scripts/publish-release.mjs`
- 统一模板 resolver：`packages/core/src/plan-templates.ts`
- plan / subplan 调用：`packages/core/src/plan.ts`
- CLI validate 与 `choiceRequiredTasks`：`packages/cli/src/cli.ts`
- 用户安装文档：`README.md`

### 补充检索词

- `marketplace.json packages/codex-adapter`
- `materialized shared skills`
- `verifySharedSkillsSynced assertSharedSkillsSynced`
- `marketplace-style cache copy`
- `resolveSeedPlanTemplate choiceRequiredTasks`
- `codex plugin marketplace add upgrade`

## 2026-07-16：Codex 开发安装同步 marketplace source 与 cache

### 结论

- Codex 的 active plugin 由 marketplace identity 与该 marketplace entry 的 `source` 决定；版本化 cache 中存在更高版本目录，不代表当前任务实际绑定了该目录。
- 维护者本地开发安装必须同步两层状态：先更新 active local marketplace entry 指向的 source payload，再从该 source 写入 versioned Codex cache。只写 cache 会留下 source/cache 分叉，重启或新任务仍可能加载旧 source 对应的技能。
- 技能 snapshot 在任务创建时绑定；安装器完成后必须重启 Codex 并创建新任务，不能用当前长线程是否刷新来判断安装是否成功。

### 真实安装链路

- `scripts/install-codex-plugin.ps1` 调用 `scripts/install-codex-plugin.mjs`。
- `scripts/install-codex-plugin.mjs` 调用 `installCodexPluginDevelopmentSurface(...)`，而不是直接调用只写 cache 的 `installCodexPluginBundle(...)`。
- `scripts/codex-plugin-bundle.mjs` 的 `installCodexPluginDevelopmentSurface(...)` 先读取 development marketplace 的 `marketplace.json`，按插件名查找 entry，并要求 `entry.source.source === "local"` 且 `entry.source.path` 是字符串。
- resolver 会把 `entry.source.path` 解析为 marketplace root 内的绝对路径，并拒绝逃逸 marketplace root 的 source。缺少对应 plugin entry、非 local source 或越界路径都属于硬错误。
- source 校验通过后，安装器先把仓库 `packages/codex-adapter` payload 刷新到 marketplace source；随后 `installCodexPluginBundle(...)` 以该 marketplace source 为输入，将同一 payload 写入 `<cacheRoot>/<plugin-name>/<manifest-version>`。
- 当调用方显式传入的 `sourceDir` 已经等于 marketplace source 时，可以跳过 source-to-source 复制，但 cache 仍必须从经 marketplace 校验的 source 生成。

### 长期规则与陷阱

- “cache 中最高版本存在”只能证明该目录被写入，不能证明 Codex 的 active marketplace entry 指向它，也不能证明当前任务使用它。
- 开发安装验收至少要核对 marketplace 名称、`marketplace.json` entry、resolved source path、source manifest/version、cache manifest/version，以及重启后新任务绑定的 skill snapshot。
- 安装器不得静默猜测不存在的 marketplace entry，也不得把任意 local path 当成 active source；identity/source 校验是避免写对 cache、加载错插件的边界。
- 远端用户的官方 Git marketplace 安装仍遵循仓库 `.agents/plugins/marketplace.json -> ./packages/codex-adapter` 的发布合同；本节描述的是维护者本机 development marketplace 更新链路，不改变用户分发入口。

### 验证标准

- `scripts/codex-plugin-bundle.test.mjs` 覆盖 source-before-cache：先刷新 marketplace source，再验证 source 与 versioned cache 的 manifest 版本一致，并确认 source 中旧 payload 已被清除。
- 同一测试文件覆盖缺失 plugin entry 的拒绝路径，防止安装器退化为绕过 marketplace identity 的 cache-only 写入。
- PowerShell wrapper 的成功提示必须同时表达 marketplace source 与 cache 已更新，并明确重启 Codex、创建新任务的生效边界。

### 关联代码

- development marketplace 解析与安装编排：`scripts/codex-plugin-bundle.mjs`
- Node CLI wrapper：`scripts/install-codex-plugin.mjs`
- PowerShell 开发入口：`scripts/install-codex-plugin.ps1`
- 回归测试：`scripts/codex-plugin-bundle.test.mjs`
- development marketplace manifest：`C:\Users\chany\.agents\plugins\claw-kit-local\marketplace.json`
- 仓库插件 payload：`packages/codex-adapter`

### 补充检索词

- `installCodexPluginDevelopmentSurface`
- `marketplace source before cache`
- `active plugin identity source`
- `versioned cache is not active plugin`
- `restart Codex new task skill snapshot`

## 2026-07-16：Codex update 以 active identity/source 为完成边界

### 结论

- 第三方官方 Codex 安装的规范 identity 是 `claw-kit@claw-kit`；`codex plugin marketplace upgrade claw-kit` 只刷新 marketplace snapshot，不等于该 plugin identity 已重新安装、启用或成为 active surface。
- marketplace upgrade 后必须重新安装或启用 `claw-kit@claw-kit`，并检测仍启用的旧同名 identity，例如 `claw-kit@claw-kit-local`。旧 identity 指向旧 source 时，即使磁盘上已有更新 cache，Codex 仍可能加载旧技能。
- cache 目录只是安装 artifact，不是 active plugin 证明。Codex 更新验收必须同时证明 active identity、marketplace source manifest、cache manifest 与 target version 一致，并在 restart/new task 后确认 loaded skill locator 来自预期版本。

### Canonical update skill 合同

- `shared/skills/update/SKILL.md` 保存高信号入口规则：官方 identity、cache 非激活证明、旧同名 identity 检测，以及 CLI/plugin 双 surface 完成边界。
- `shared/skills/update/TEMPLATE.json` 保存逐步执行合同：升级 marketplace 后重新安装/启用 identity，按官方或 development route 核对 source/cache manifest，清理 stale same-name identity，并在新任务验证 loaded locator。
- `shared/skills/update/non-claw-fallback.md` 为未进入 claw template 的等价后备流程；`shared/skills/update/CONTENT-COVERAGE.md` 明确 active identity/source verification 属于必须覆盖内容。
- Codex/OpenCode adapter 中的 `update` 副本由 `sync:shared-skills` 从 `shared/skills/update/` 生成；adapter 副本不是独立编辑入口。

### 官方与开发 identity 边界

- 官方仓库 marketplace 路线使用 `claw-kit@claw-kit`，配套 cache root 是 `%USERPROFILE%\.codex\plugins\cache\claw-kit\claw-kit\`。
- 维护者 development marketplace 路线使用 `claw-kit@claw-kit-local`，source 位于 `%USERPROFILE%\.agents\plugins\claw-kit-local\plugins\claw-kit\`，配套 cache root 是 `%USERPROFILE%\.codex\plugins\cache\claw-kit-local\claw-kit\`。
- 两个 identity 可以在磁盘上同时留下 artifacts；验证时必须确认当前应使用的 identity 已启用，并处理指向旧 source 的另一个同名 identity。不能假设版本最高的 cache 自动获胜。

### 验收顺序

1. 确认 target version 与预期 marketplace。
2. 对官方路线执行 marketplace add/upgrade，再安装或启用 `claw-kit@claw-kit`；对 development 路线执行维护的 source-and-cache installer。
3. 检查并禁用/卸载仍指向旧 source 的同名 identity。
4. 比对 active identity 对应的 marketplace source manifest、cache manifest 与 target version，并确认 active source/cache 中包含 `planning`、`config`、`update`、`create-claw-skill` 及声明资源。
5. 重启 Codex，创建新任务，确认 loaded skill locator 属于预期 identity/version。

任一步缺失都不能仅凭 cache 目录存在报告更新成功。

### 本机 development route 验证基线

- 执行修复后的 `npm run install:codex-plugin` 后，预期 active development identity 仍是 `claw-kit@claw-kit-local`；该身份与官方第三方 `claw-kit@claw-kit` 的用途不可混淆。
- 仓库 `packages/codex-adapter/.codex-plugin/plugin.json`、development marketplace source manifest 与对应 versioned cache manifest 均为 `0.1.63+codex.20260715132514`。
- 三处 `skills/using-claw-kit/SKILL.md` 的 SHA256 均为 `614ABD613718EAB598C4535B3BA38829A9FD4F3AC81749F08D61097B715CE268`，证明该次安装的 repo/source/cache payload 一致。
- 上述文件一致性仍不热替换当前任务绑定的旧 catalog；重启 Codex 并创建新任务、再确认 loaded locator，才是最终加载边界。

### 关联代码与文档

- canonical skill：`shared/skills/update/SKILL.md`
- canonical template：`shared/skills/update/TEMPLATE.json`
- fallback：`shared/skills/update/non-claw-fallback.md`
- coverage contract：`shared/skills/update/CONTENT-COVERAGE.md`
- shared-copy 生成：`scripts/sync-shared-skills.mjs`、root `package.json` 的 `sync:shared-skills`
- 用户入口：`README.md`
- 分发与验收：`DISTRIBUTION.md`
- template/bundle 回归：`scripts/codex-plugin-bundle.test.mjs`

### 补充检索词

- `claw-kit@claw-kit`
- `claw-kit@claw-kit-local`
- `marketplace upgrade reinstall enable`
- `active identity source cache target version`
- `restart new task loaded locator`

### 最终验收基线

- 该轮 source-aware installer 与 update identity 合同通过全仓 `npm run check`、core `114/114`、CLI `63/63`、Codex bundle `11/11`、shared sync/bundle 合并 `14/14`、update skill quick validation 与 `git diff --check`。后续修改上述安装链路时，应继续覆盖 core/CLI、bundle、shared-copy 与 update template 四层，而不是只跑单一 installer smoke。
- 本机清理了 stale `0.1.12` development cache，仅保留 `0.1.63`；这用于消除旧 artifact 干扰，但仍不能替代 active identity/source 与新任务 loaded locator 的验收。
- 通用 plugin validator 当前会拒绝官方 manifest 已支持且本插件正在使用的既有 `hooks` 字段。该结果属于 validator schema 与官方 manifest surface 的兼容性差异，不应为了让通用 validator 通过而删除 `packages/codex-adapter/.codex-plugin/plugin.json` 的 `hooks`；应以官方 manifest 支持、Codex 实际加载与项目定向测试为准。

## 2026-07-16：0.1.66 repository marketplace 与 committed materialization

### 官方 marketplace 命令面

- 当前官方 Codex manual 规定 `codex plugin marketplace add` 可接收 GitHub shorthand、Git URL、SSH URL 或本地 marketplace root。
- `--ref` 用于固定 Git ref；可重复的 `--sparse` 用于控制 Git-backed marketplace 的 sparse checkout。
- `codex plugin marketplace list` 用于报告已配置 marketplace snapshot 及其 resolved root，排查安装来源时应以该输出确认实际解析结果。

### claw-kit 的仓库安装合同

- 仓库 marketplace manifest 位于 `.agents/plugins/marketplace.json`。每个 plugin 的 `source.path` 必须以 `./` 开头，并相对于 marketplace root 解析。
- claw-kit entry 的 `source.path` 是 `./packages/codex-adapter`，因此 repository marketplace 直接安装 Git 中已提交的 Codex adapter payload。
- `shared/skills/planning/`、`shared/skills/config/`、`shared/skills/update/`、`shared/skills/create-claw-skill/` 是 authoring sources。`scripts/sync-shared-skills.mjs` 将这些目录的完整文件物化到 `packages/codex-adapter/skills/` 与 `packages/opencode-adapter/skills/`；生成的 `SKILL.md` 保留 source banner，adapter 副本不是独立编辑入口。
- Repository marketplace 安装不依赖 npm lifecycle，也不依赖安装时或 build 时临时生成 shared skills；安装输入是 Git 中已提交且已经物化的 `packages/codex-adapter` 树。
- GitHub Release ZIP 是同一 adapter payload 的衍生副本，不参与 repository marketplace 安装链路。只有明确要求 offline/manual artifact policy 时，才需要把 ZIP 作为额外必需分发面。

### Sparse checkout 边界

- 只 sparse checkout `.agents/plugins` 不足以安装 claw-kit，因为 manifest 的 `source.path` 指向该目录之外的 `packages/codex-adapter`。
- 对 claw-kit 应优先使用完整 checkout；若必须 sparse checkout，则至少同时包含 `.agents/plugins` 与 `packages/codex-adapter`，保证 source path 能在 resolved marketplace root 下命中真实插件树。

### 0.1.66 验证基线

- `v0.1.66` Git tree 同时包含 `.agents/plugins/marketplace.json` 与四个 shared skills 在 `packages/codex-adapter/skills/` 下的全部物化文件和资源。
- `verifySharedSkillsSynced(...)` 返回 `{ok:true,problems:[]}`。
- `scripts/publish-release.mjs` 在 release 前要求 Codex adapter 物化内容与 shared sources 一致，漂移或缺失会阻止发布。
- `npm run test:codex-plugin` 通过 `11/11`，覆盖 materialized source、marketplace target、cache copy 与 exported bundle。

### 关联代码

- marketplace manifest：`.agents/plugins/marketplace.json`
- shared authoring sources：`shared/skills/planning/`、`shared/skills/config/`、`shared/skills/update/`、`shared/skills/create-claw-skill/`
- materialization：`scripts/sync-shared-skills.mjs`
- committed Codex marketplace payload：`packages/codex-adapter/`
- release gate：`scripts/publish-release.mjs`
- Codex bundle tests：`scripts/codex-plugin-bundle.test.mjs`

### 补充检索词

- `codex plugin marketplace add --ref --sparse`
- `marketplace list resolved root`
- `repository marketplace committed materialization`
- `verifySharedSkillsSynced 0.1.66`
- `release ZIP derivative payload`
