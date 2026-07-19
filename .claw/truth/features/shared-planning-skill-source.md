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
- 共享后的 `planning` skill 保持宿主无关：它只描述如何产出高质量 plan 内容，不承担 claw-kit runtime、project-plan admission、status 语义、writer dispatch、goal mode 或 closeout 规则。
- `planning` 不以预设 task 数量作为拆分目标。当前拆分边界是可验收的进度检查点：检查点完成后，后续工作应能继续执行，或该阶段能被独立重试；文件、命令、文档、测试、构建、检查和 review 默认保留在同一 task 内，除非它们本身形成有意义的检查点。
- 当现有证据不足以可靠确定后续步骤时，`planning` 只规划到决定路线的检查点，并在该检查点完成后用其证据进行第二次规划、追加下一批可执行 tasks；不得为了让初始计划显得完整而虚构推测性的后续 tasks。
- `planning` handoff 要求与用户讨论并确认当前阶段的 requirements 和 proposed solution；若实施路线依赖尚未取得的证据，就把决定路线的检查点及其后续 planning task 作为当前阶段 solution，而不是猜测下游实现方案。
- `planning` 的文案所有权已收敛：`Planning principles` 只承载规划过程与任务拆分规则；`Quality bar` 单独拥有“好计划需要传达什么”的标准，包括当前阶段目标与决策逻辑、拆分理由与先后顺序、范围与非目标、受控风险与延后事项、可观察的 task/round 完成条件以及可交接性。不得再在开头用独立 `A good plan should answer` 清单重复这些标准。
- `planning` 不定义强制的实施后 `user-review` task、同一 plan 的跨轮反馈循环或独立 review lifecycle。若可预见任务会反复修改，当前 `How to write` 规则会询问用户是否要在 closeout 前增加一个最终 `manual-review` task，并且只在用户明确请求时追加；这是 opt-in 的 task-shape guidance，不是默认 lifecycle stage。执行前的当前阶段 solution discussion 仍由 default planning bridge 与 shared planning 合同共同承担。
- `planning` 不承载 `claw-kit` 仓库专属的比例化 TDD 政策；`shared/skills/planning/SKILL.md` 及 Codex/OpenCode 物化副本都不应包含该规则，避免把仓库开发约束传播给插件使用方的其他项目。
- 当前仓库比例化验证与测试政策由根目录 `AGENTS.md` 承载：验证不应重于其保护的执行，只有明确且现实的高成本回归风险才能证明额外成本合理；成本判断覆盖选择、编写、运行、排障和维护 checks 的总成本。低风险改动使用最轻可信验证；纯文档或其他不可执行变更、高频变化或合同未稳定的区域优先使用审阅、结构检查、smoke、探针或定向手工验证；高风险稳定行为、已复现缺陷、关键边界和兼容合同优先使用针对性自动化测试。
- ADR 保存稳定决策、理由和取舍，防止未来修改静默逆转设计意图；它与行为回归测试互补，但不会机械触发文档测试，也不能替代高风险运行时行为所需的测试。上述当前 owner 边界由本文拥有，迁移到仓库 `AGENTS.md` 的决策及其取舍由 `.claw/truth/adr/workflow-cost-optimization-route.md` 拥有。
- 共享后的 `config` skill 保持宿主无关：它只描述配置入口、team-vs-personal scope 判断、canonical field shape 和 override 格式，不承担 claw-kit lifecycle 或 writer dispatch。
- 共享后的 `create-claw-skill` skill 保持宿主无关：它只负责把既有 skill 或用户想法转换成 claw-template-backed skill，不承担 claw-kit runtime、project-plan admission、status 语义、writer dispatch、goal mode 或 closeout 规则。
- 为了避免把试验性产物误固化成长期合同，`brainstorming` 和 `systematic-debugging` 这类在创建 `create-claw-skill` 过程中生成的测试 skill 树不应作为正式 shared skills/templates 保留在仓库里；它们不属于 `scripts/sync-shared-skills.mjs` 的默认维护列表，除非未来被明确重新晋升。
- claw-kit 专属运行时语义继续保留在两个 adapter 的 `using-claw-kit/SKILL.md` 中，而不是重新回流到通用 shared skills；project-plan versus direct-work 的入口判断属于这个入口 skill，而不是 `shared/skills/planning/SKILL.md`。

## 影响

- 以后修改 planning skill 时，只需要编辑 `shared/skills/planning/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- 以后修改 config skill 时，只需要编辑 `shared/skills/config/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- 以后修改 create-claw-skill skill 时，只需要编辑 `shared/skills/create-claw-skill/SKILL.md`，不应再分别修改 codex 和 opencode 两份副本。
- planning 文案可以继续朝“通用 plan skill”演化，而宿主差异与 claw-kit 专属合同应继续收敛到 `using-claw-kit` 或其他宿主级入口技能中；如果未来再调整 project-plan admission 或 direct-work 语义，应同时修改两个 host-specific 入口 skill，而不是把入口规则写回 shared planning 源。
- planning 的任务质量检查应审阅检查点是否可验收、是否支持后续继续或独立重试，以及证据依赖的后续阶段是否被延迟到第二次规划；不应以 task 数量是否落在某个范围内作为质量标准。
- 2026-07-19 的只读质量 review 在当时的 planning 文案中发现四项缺口：三处强制确认 `proposed solution` 与证据依赖的阶段性规划冲突；复杂前向场景仍在 planning task 之后预建实现、Windows 验证和文档 tasks；简单 CLI 错误消息场景把没有独立检查点价值的包级验证拆开；`## When to use` 与多个质量章节存在重复。该 review 同时确认结构与分发同步健康，这些结论只描述 review 当时的源码和场景结果。
- 当前 working tree 已用更晚的 shared planning 文案取代上述 skill 内缺口：handoff 要求讨论并确认当前阶段 requirements 与 proposed solution；若实施路线依赖证据，则确认决定路线的 checkpoint 及其后续 planning task 作为当前阶段 solution，不猜测最终实现方案。planning task 是初始 task list 的末端边界，依赖未知证据的 implementation、validation、documentation 或 closure tasks 必须等它运行后再追加；支持性 validation 默认留在同一 outcome task，只有形成独立 gate、ownership、retry 或 materially different risk 价值时才拆分；可预见反复修改时只询问是否增加 final `manual-review` task，并且只在用户请求时增加；trigger 已收敛进 frontmatter，重复章节已合并。三份当前 shared/Codex/OpenCode 文件的文本合同一致。
- `packages/core/src/templates/plans/default.ts` 与 `packages/core/src/workflow-guidance.config.json` 现在也要求在准备 task list 前讨论并确认 requirements 与 proposed solution。该 lifecycle bridge 的当前实现由 `.claw/truth/features/cli-guided-workflow.md` 拥有；本文拥有 evidence-dependent checkpoint route 如何满足 proposed-solution handoff 的 shared planning 质量合同。
- 本次 knowledge pass 只做了实现锚点与后续 diff 的只读 freshness check，没有重跑前向场景；因此可以确认当前文本合同已覆盖 review 建议，但不能把旧场景结果提升为对新文案行为效果的重新验证。
- `Add optional manual review planning guidance` 的 completed closeout 记录了 planning-only 定向同步、精确文本检查与 diff 检查通过，并明确没有运行完整测试套件；本次 freshness check 只确认 `shared/skills/planning/SKILL.md` 及 Codex/OpenCode 物化副本当前都包含同一句 opt-in 规则，不把该结果扩大为未执行的全量验证。
- shared planning 不应重新加入仓库专属的 TDD admission policy；在本仓库内规划开发工作时由根 `AGENTS.md` 提供比例化测试约束，插件使用方的其他项目不会从 shared planning skill 继承该政策。
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
- `.claw/tasks/优化-planning-skill-的任务拆分与二次规划规则/plan.json`
- `.claw/tasks/优化-planning-skill-的任务拆分与二次规划规则/plan.report`
- `.claw/tasks/Review-planning-skill-quality/plan.json`
- `.claw/tasks/Review-planning-skill-quality/plan.report`
- `.claw/tasks/Apply-planning-skill-review-improvements/plan.json`
- `.claw/tasks/Apply-planning-skill-review-improvements/plan.report`
- `.claw/tasks/Merge-planning-quality-guidance/plan.json`
- `.claw/tasks/Merge-planning-quality-guidance/plan.report`
- `.claw/tasks/Add-optional-manual-review-planning-guidance/plan.json`
- `.claw/tasks/Add-optional-manual-review-planning-guidance/plan.report`
## 2026-07-13：staging-only 导出与 update skill 审计

- `planning` 与 `config` 的规范源仍然只在 `shared/skills/`；适配器副本不应作为 Git 追踪文件或日常编辑入口。
- `scripts/codex-plugin-bundle.mjs` 和 `scripts/opencode-plugin-bundle.mjs` 现在应在临时 staging 目录内生成所需的 adapter-local skill 副本，再把最终 payload 写入安装缓存；本地插件安装、adapter `build`、`check` 不应覆写仓库中的 `packages/*-adapter/skills/**/SKILL.md`。
- 当时针对 `update` 的仓库、已安装 Codex plugin cache 和用户 skill 目录审计未发现真实 skill；该历史结论先被 `0.1.62` 的 shared package 发布取代，又在 2026-07-18 被 host-specific ownership 取代。当前规范源分别位于两个 adapter，见 `.claw/truth/features/host-specific-update-skills.md`。
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
- full template task 的 `guidance.onDone` 会参与任务完成时的 guidance 合并；若 task 定义 choices，当前 CLI 由 `claw task done --id <id> --choice <choice-id>` 或 `claw task edit --id <id> --status done --choice <choice-id>` 选择对应分支，所选分支的 `summary` 等字段进入运行时响应。旧 `plan edit --choice-id` 只保留在下方明确标注的历史 smoke 中。
- CLI compact plan response 必须保留 `workflowGuidance.summary`，并继续以顶层 `summary` 返回；不能只保留 `nextsteps`、`recommendedCommands` 或折叠后的 `planSummary`。
- 当时的 `shared/skills/update/TEMPLATE.json` 是 full `PlanDocument` template；当前两个 adapter-owned `update/TEMPLATE.json` 仍沿用同一 full-template resolver，不需要降格为 legacy `SeedPlanTemplate`。

### 真实调用链路

- root plan：CLI `plan create` -> `writePlan(...)` -> `createPlanFromTemplate(...)` -> `resolvePlanTemplate(...)` -> seed/full template 实例化。
- child plan：CLI `subplan create` -> `createSubplan(...)` -> `writePlan(...)` -> 同一 `createPlanFromTemplate(...)` / `resolvePlanTemplate(...)` 链路 -> 统一实例化后补 parent linkage 并更新父任务 execution。

### 验证标准

- 全仓 `npm run check` 通过。
- Core 测试：90/90 通过。
- CLI 测试：56/56 通过。
- Codex bundle 测试：6/6 通过。
- OpenCode bundle 测试：5/5 通过。
- 该轮隔离 live smoke 使用当时的 canonical `shared/skills/update/TEMPLATE.json`：`plan create --template update` 与 `subplan create --template update` 均生成 `process.active`、3 tasks 的 plan；child 明确记录 `parentPlan = plan.json`、`parentTaskId = 1`。
- 同一历史 smoke 中，`plan edit ... --choice-id codex` 返回 `summary = The current host route is Codex.` 和 `nextTask = 2`。当前 host-specific templates 已删除该 platform choice；这条记录只证明 full-template choice 语义在当时进入真实运行时响应。

### 关联代码

- `shared/skills/update/SKILL.md`（该轮历史路径，现已删除）
- `shared/skills/update/TEMPLATE.json`（该轮历史路径，现已删除）
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
- `shared/skills/` 仍是跨适配器共享内容的规范源；但作为官方 marketplace 安装源的 `packages/codex-adapter/` 必须在 Git 中提交已物化的 shared skills，并直接提交 adapter-owned `update` 及其全部模板、helper 和其他资源。两类 skills 共同组成自包含插件树。
- `scripts/sync-shared-skills.mjs` 现在同时提供 `verifySharedSkillsSynced(...)` 与 `assertSharedSkillsSynced(...)` 只读校验。发布门禁在 marketplace 源缺少共享 skill 或内容漂移时直接失败；`scripts/codex-plugin-bundle.mjs` 导出时不再隐式同步来掩盖源目录缺失。
- `scripts/codex-plugin-bundle.test.mjs` 的 marketplace-style cache copy 测试从真实 `packages/codex-adapter` 源树复制到临时版本化 cache，并验证 shared-materialized skills、adapter-owned `update` 以及 template / helper 资源齐全。这一验证与 release zip 验证是两个不同发布面。
- 当前模板统一入口是 `packages/core/src/plan-templates.ts` 的 `resolveSeedPlanTemplate(...)`。`claw plan create`、`claw subplan create` 与 `claw template validate` 都复用该 resolver；此前文档中的 `resolvePlanTemplate(...)` / 分离式解析描述已被这一当前实现取代。
- `packages/core/src/plan.ts` 的创建 scope 解析会把无 `.claw` cwd 下的显式 `claw plan create --template <id>` 自动放入 session scope；同一命令在已有项目内保持 project scope。普通不带显式 template 的 `claw plan create "<title>"` 仍走项目初始化，不受此自动规则影响。
- `claw template validate` 除模板有效性外，还输出 `choiceRequiredTasks`，用于暴露哪些 task 在完成时要求 `choice-id`。
- 合并远端后的统一版本线是 `0.1.63`：root、core、CLI、Codex adapter、OpenClaw adapter 与 OpenCode adapter 的 package version 均对齐到 `0.1.63`。

### 长期行为 / 规则

- 官方 marketplace 源必须是已提交、自包含、可直接复制的插件树；不能以“bundle 导出时能够生成完整 payload”替代对 `packages/codex-adapter` 源树完整性的验证。
- 共享内容的维护入口仍是 `shared/skills/`，但每次共享 skill 或资源变更后，必须同步更新并提交 marketplace 源中的物化副本，再由只读 verify/assert 检查缺失与漂移。
- release gate 必须同时验证 `.agents/plugins/marketplace.json` 的 source 路由、物化源树与 shared source 一致，以及 bundle / isolated template 可用性；任何一个发布面失败都不能发布。
- 用户安装与升级 Codex 插件的规范路径是 `codex plugin marketplace add chanyuenpang/claw-kit --ref main` 和 `codex plugin marketplace upgrade claw-kit`，随后在 Codex 插件目录中安装或刷新 Claw Kit。直接写入本机 plugin cache 的安装脚本只用于维护者本地开发，不是远端用户分发入口。
- plan create、subplan create 与 template validate 的模板语义必须继续由同一个 `resolveSeedPlanTemplate(...)` 决定，避免创建路径与校验路径对同一模板给出不同结论。
- 自动 session scope 只由“无 project root + 显式 template”触发；skill entry 不应重复暴露存储 scope，显式 `--scope session` 与 template 自带 `scope: "session"` 仍保留强制覆盖能力。

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

### 当时的 shared update skill 合同（已被 host-specific ownership 取代）

- `shared/skills/update/` 在该轮保存统一入口、模板、fallback 与 coverage；这些路径是 2026-07-16 的历史证据，不再是当前维护面。
- 2026-07-18 起，Codex/OpenCode adapter 各自独立拥有 `update` package，shared sync 不再生成它们；当前合同见 `.claw/truth/features/host-specific-update-skills.md`。

### 官方与开发 identity 边界

- 官方仓库 marketplace 路线使用 `claw-kit@claw-kit`，配套 cache root 是 `%USERPROFILE%\.codex\plugins\cache\claw-kit\claw-kit\`。
- 维护者 development marketplace 路线使用 `claw-kit@claw-kit-local`，source 位于 `%USERPROFILE%\.agents\plugins\claw-kit-local\plugins\claw-kit\`，配套 cache root 是 `%USERPROFILE%\.codex\plugins\cache\claw-kit-local\claw-kit\`。
- 两个 identity 可以在磁盘上同时留下 artifacts；验证时必须确认当前应使用的 identity 已启用，并处理指向旧 source 的另一个同名 identity。不能假设版本最高的 cache 自动获胜。

### 验收顺序

1. 确认 target version 与预期 marketplace。
2. 对官方路线执行 marketplace add/upgrade，再安装或启用 `claw-kit@claw-kit`；当 `codex plugin list` 不可访问时，可由 repository bundle installer materialize official cache。对 development 路线执行维护的 source-and-cache installer。
3. 检查并禁用/卸载仍指向旧 source 的同名 identity。
4. 比对 active identity 对应的 marketplace source manifest、cache manifest 与 target version，并确认 active source/cache 中包含 `planning`、`config`、`update`、`create-claw-skill` 及声明资源。
5. 重启 Codex，创建新任务，确认 loaded skill locator 属于预期 identity/version。

任一步缺失都不能仅凭 cache 目录存在报告更新成功。

### 本机 development route 验证基线

- `npm run install:codex-plugin` 只刷新 development local source 与 versioned cache，不决定当前 active identity。当前本机 active identity 可以继续是 official `claw-kit@claw-kit`，同时 `claw-kit@claw-kit-local` 保持未启用；该状态不能仅凭 cache 目录推断。
- 仓库 `packages/codex-adapter/.codex-plugin/plugin.json`、development marketplace source manifest 与对应 versioned cache manifest 均为 `0.1.63+codex.20260715132514`。
- 三处 `skills/using-claw-kit/SKILL.md` 的 SHA256 均为 `614ABD613718EAB598C4535B3BA38829A9FD4F3AC81749F08D61097B715CE268`，证明该次安装的 repo/source/cache payload 一致。
- 上述文件一致性仍不热替换当前任务绑定的旧 catalog；重启 Codex 并创建新任务、再确认 loaded locator，才是最终加载边界。

### 该轮历史关联代码与文档

- 当时的 canonical skill：`shared/skills/update/SKILL.md`（已删除）
- 当时的 canonical template：`shared/skills/update/TEMPLATE.json`（已删除）
- 当时的 fallback：`shared/skills/update/non-claw-fallback.md`（已删除）
- 当时的 coverage contract：`shared/skills/update/CONTENT-COVERAGE.md`（已删除）
- 当时的 shared-copy 生成：`scripts/sync-shared-skills.mjs`、root `package.json` 的 `sync:shared-skills`
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
- `shared/skills/planning/`、`shared/skills/config/`、`shared/skills/create-claw-skill/` 与 `shared/skills/knowledge-writer/` 是当前 authoring sources。`scripts/sync-shared-skills.mjs` 将这些目录的完整文件物化到两个 adapter；`update` 是明确的 adapter-owned exception，不带 shared source banner。
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
- shared authoring sources：`shared/skills/planning/`、`shared/skills/config/`、`shared/skills/create-claw-skill/`、`shared/skills/knowledge-writer/`
- host-specific update sources：`packages/codex-adapter/skills/update/`、`packages/opencode-adapter/skills/update/`
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

## 2026-07-16：0.1.67 asset-free marketplace 发布合同

### 结论

- `scripts/publish-release.mjs` 现在直接验证 committed `HEAD` 中的 `.agents/plugins/marketplace.json`、`packages/codex-adapter/.codex-plugin/plugin.json` 以及必需的 adapter skill / resource paths。通过验证的 committed repository marketplace snapshot 就是 Codex release artifact，不要求附加 GitHub Release ZIP。
- `DISTRIBUTION.md`、`README.md`、`CHANGELOG.md` 与 Codex bundle contract tests 共同定义这条 asset-free Git marketplace release protocol；发布验收不应再把 ZIP asset 数量或 ZIP 上传作为成功条件。
- Repository URL 安装会执行真实 Git clone。`0.1.67` 的完整 Git marketplace clone 在当前仓库上约耗时四分钟，因此安装时间不能被误判为 metadata-only manifest fetch。
- Metadata-only sparse checkout 仍无效：`.agents/plugins/marketplace.json` 的 `source.path` 指向 `packages/codex-adapter`。完整 checkout 是默认安全路径；使用 sparse checkout 时必须同时覆盖 marketplace manifest 与 adapter source tree。

### 验证标准

- Release source commit 必须先位于 `origin/main`，再运行 `npm run verify:release` / publish 流程。
- Release gate 必须从 committed `HEAD` 验证 marketplace manifest、plugin manifest 和 adapter resources，而不是依赖工作树临时生成物。
- Codex bundle contract tests 必须覆盖 repository marketplace target 与 committed materialization；`0.1.67` 基线为 `12/12`。
- 真实用户路径至少验证 `codex plugin marketplace add chanyuenpang/claw-kit --ref main` 与 `codex plugin add claw-kit@claw-kit`，并核对 active identity 的 marketplace snapshot manifest 与 official cache manifest 版本一致。

### 关联代码与文档

- repository marketplace：`.agents/plugins/marketplace.json`
- committed plugin manifest：`packages/codex-adapter/.codex-plugin/plugin.json`
- committed adapter payload：`packages/codex-adapter/`
- release gate：`scripts/publish-release.mjs`
- bundle contract tests：`scripts/codex-plugin-bundle.test.mjs`
- distribution contract：`DISTRIBUTION.md`
- user installation contract：`README.md`
- release history：`CHANGELOG.md`

### 补充检索词

- `0.1.67 asset-free Git marketplace`
- `committed HEAD marketplace snapshot`
- `GitHub Release zero assets`
- `repository clone four minutes`
- `claw-kit@claw-kit official identity`
