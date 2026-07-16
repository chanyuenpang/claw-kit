# ADR: Shared source for host-neutral skills

## Status

Accepted

## Context

`claw-kit` now treats `planning` and `config` as generic host-neutral skills rather than host-specific claw runtime surfaces.
At the same time, both Codex and OpenCode plugin payloads still need physical skill files inside their own adapter directories so local skill loading and exported bundles continue to work.

Maintaining separate copies in adapter directories creates unnecessary drift, especially when only one copy is edited and the other is forgotten.

The final `0.1.49` release line extended this shared-source rule from `planning` to the user-facing `config` skill and verified that generated Codex/OpenCode adapter payloads stay synchronized from `shared/skills`.

The original synchronization implementation wrote those adapter-local copies into the checkout before bundling or installing. That made a normal local plugin refresh modify tracked source files, despite those files being generated artifacts. The `0.1.61` release therefore moved generation into temporary staging.

`0.1.63` 进一步确认：临时 staging 不能作为 Codex Git marketplace 的唯一物化边界。Codex 官方 marketplace 从 Git 仓库复制 `source.path` 指向的插件目录，不会先运行仓库自定义同步脚本；如果 `packages/codex-adapter` 本身缺少 shared skill 或相邻资源，远端安装得到的就是不完整插件。release zip 即使完整，也不能证明 Git marketplace 源完整。

`研究 Codex 仓库安装与 claw-kit 插件物化规则` 进一步固定了分发边界：Git-backed marketplace 跟踪仓库 ref 对应的快照，从 marketplace manifest 解析相对 `source.path`，安装期间不执行仓库的 npm lifecycle 或自定义 build。只要已提交的 `packages/codex-adapter` 通过同步一致性 release gate，GitHub Release ZIP 就只是同一 payload 的可选快照，不是仓库 URL 安装的依赖。

`修复 Codex 插件 active install 与 update 流程` 进一步确认：Codex 实际加载的插件由 active marketplace identity 及其 source 决定，versioned cache 中出现更高版本目录并不代表该版本已经生效。维护者开发安装如果只写 cache、没有刷新 `claw-kit@claw-kit-local` 对应的 local marketplace source，会留下“cache 已更新、active source 仍旧”的静默分叉；第三方更新也可能因为同名旧 identity 仍处于 active 状态而继续加载错误 payload。

随后，`fix-skill-local-subplan-template-resolution` 计划进一步暴露了运行时边界：shared skill 的 `TEMPLATE.json` 是完整 `PlanDocument` 模板，而旧 `.claw/templates` 仍使用 `SeedPlanTemplate`。如果 `claw plan create` 与 `claw subplan create` 分别维护发现、schema 判别和实例化逻辑，同一个 skill-local 模板就会在 root plan 与 subplan 路径上产生不一致行为。

## Decision

Use shared sources for host-neutral skills, including future shared workflow skills that ship additional resources:

- canonical source: `shared/skills/planning/SKILL.md`
- canonical source: `shared/skills/config/SKILL.md`
- canonical source: `shared/skills/update/`
- canonical source: `shared/skills/create-claw-skill/`

Codex Git marketplace 的发布源必须是已提交、自包含的 `packages/codex-adapter` 插件树：

- `.agents/plugins/marketplace.json` 的 `source.path` 固定指向 `./packages/codex-adapter`
- 远程安装继续以 Git-backed repository marketplace 为正式安装面；GitHub Release ZIP 可以提供固定快照，但不是必需安装面
- marketplace 安装不得依赖 `npm install`、npm lifecycle、build 或同步脚本在目标机器上补全 payload
- Git checkout / sparse checkout 必须同时包含 marketplace manifest 及其 `source.path` 指向的 `packages/codex-adapter`；只取 `.agents/plugins` 的 sparse checkout 不构成完整安装源
- `packages/codex-adapter/skills/planning/`、`config/`、`update/`、`create-claw-skill/` 必须在提交中包含完整目录及全部相邻资源
- `shared/skills` 仍是规范维护源；维护者通过显式 `npm run sync:shared-skills` 更新派生副本，审查后连同源文件一起提交
- `scripts/publish-release.mjs` 通过 `assertSharedSkillsSynced(...)` 只读比较规范源与已物化副本；缺失、文件集合不完整或内容落后时必须失败
- `scripts/codex-plugin-bundle.mjs` 只能导出和安装当前 `packages/codex-adapter` 内容，不得在临时 staging 中隐式同步 shared skills 来掩盖仓库源缺失

Codex 安装与更新采用 active identity/source 合同：

- 维护者开发安装必须先校验并刷新 `claw-kit@claw-kit-local` 对应的 local marketplace source，再从该 source 写入 versioned cache；cache-only installation 不是受支持的成功态
- 第三方正式 identity 固定为 `claw-kit@claw-kit`；marketplace upgrade 后必须重新安装或启用该 identity，并检测、处理会抢占加载结果的 stale same-name identity
- 安装或更新验收必须同时对齐 active identity、marketplace source manifest、cache manifest 与 target version，不能用 cache 目录存在或最高版本目录作为单独成功证据
- 插件更新只有在 Codex restart 后，由新任务确认 loaded skill locator 时才算运行时生效；既有任务不承担 hot-reload 验证

OpenCode 等不通过 Codex Git marketplace 直接复制仓库插件树的适配器，可以继续在 bundle/install staging 中物化派生副本；这不改变 Codex marketplace 源必须已提交且自包含的约束。

When a shared skill is materialized, copy its complete directory recursively rather than only `SKILL.md`. This preserves template manifests, fallback guidance, and other adjacent resources required by the skill contract.

同步实现继续复用同一套显式工具，但生成动作与 release gate 分离：

- `scripts/sync-shared-skills.mjs` writes generated copies to explicitly selected adapter directories
- `scripts/sync-planning-skill.mjs` remains as a compatibility wrapper
- Codex 的同步命令是维护动作，Codex bundle/install/release verification 均不得隐式触发它
- release verification 只读验证完整目录集合和内容；验证失败时要求维护者显式同步、审查并提交
- OpenCode bundle/export 可以在临时 staging 中调用同步工具，不得反向改变 Codex marketplace 的提交要求

Keep the shared planning skill host-agnostic:

- it defines plan quality, decomposition, and scope-writing rules
- verification and closure are optional rather than default required stages; the main agent decides whether either belongs in the plan for the specific task
- it assumes `using-claw-kit` has already decided whether the request belongs in the formal claw workflow
- it does not own or duplicate the entry-time complexity scoring heuristic
- it does not define claw-kit runtime flow, status semantics, writer dispatch, goal mode, or closeout policy

Keep the shared config skill host-agnostic:

- it asks whether a config change is shared team config or personal local override
- it routes shared config to `.claw/project.json`
- it routes personal config to `.claw/project-override.json`
- it documents flat canonical field shapes and legacy compatibility boundaries
- it does not own claw lifecycle, status, writer dispatch, or direct mutation semantics

Keep claw-kit runtime-specific workflow rules in `using-claw-kit`, not in generic shared skills.

模板运行时采用单一 resolver 合同：

- `claw plan create`、`claw subplan create` 与 `claw template validate --template` 必须共用 `resolveSeedPlanTemplate(...)` 完成模板发现、冲突处理、schema 判别和规范化。
- `resolveSeedPlanTemplate(...)` 同时兼容 legacy `SeedPlanTemplate` 与 skill-local full `PlanDocument`；不得把 full template 强制降格为旧 seed schema，也不得为 create、subplan 或 validate 复制平行 resolver。
- root plan 与 subplan 的差异发生在统一模板实例化之后。subplan 只追加 `parentPlan`、`parentTaskId`，并更新父任务 execution linkage；模板内容及其运行时语义保持不变。
- full template 的 `configOverride`、task `guidance.onDone` 与 `choiceId` 是运行时合同。choice 分支由 `claw plan edit --choice-id` 显式选择，CLI compact response 必须保留 `workflowGuidance.summary`。

## Consequences

- There is only one maintained source for each host-neutral shared skill going forward.
- Codex Git marketplace、release bundle 和维护者本地安装都从同一棵已提交的 `packages/codex-adapter` 读取，不再出现“zip 完整但远端 Git 安装缺 skill”的分叉。
- 仓库 URL 安装不需要等待 GitHub Release ZIP，也不依赖目标机器执行仓库构建；发布正确性由已提交 plugin tree 与只读同步 gate 保证。
- sparse checkout 的最小边界由 marketplace manifest 和 `source.path` 联合决定，不能把 marketplace metadata 误当作完整 plugin payload。
- 维护者开发安装的完成边界从“versioned cache 已写入”提升为“active local identity/source 与 cache 一致”，避免 Codex 继续加载旧 source。
- 第三方更新的完成边界固定到 `claw-kit@claw-kit` active identity，并显式暴露 stale same-name identity 冲突。
- restart/new-task locator check 成为插件运行时生效的最终证据，避免把既有任务中的旧 skill snapshot 误判为更新失败或更新成功。
- `shared/skills` 保持单一规范维护源，同时 Codex adapter 的派生副本成为需要审查和提交的发布资产。
- release gate 发现未同步时直接失败；bundle 导出不再通过临时生成制造假阳性。
- OpenCode 仍可把 temporary staging 作为自身分发边界，而不会弱化 Codex marketplace 的自包含要求。
- A shared skill directory is an atomic distribution unit: the generated plugin must retain every required resource beside `SKILL.md`, not only the entry instruction file.
- Host/runtime-specific workflow rules remain separated from generic planning and config guidance.
- Planning does not create verification or closure tasks merely to satisfy a fixed stage template; those tasks appear only when the main agent chooses to include them for the work at hand.
- The complexity gate now has a single owner at workflow entry, so low-score tasks do not create drift by entering planning first and bypassing later.
- Future edits to planning quality or decomposition rules should start from `shared/skills/planning/SKILL.md`.
- Future edits to config routing or override-format guidance should start from `shared/skills/config/SKILL.md`.
- Edits to complexity admission, status semantics, or workflowGuidance handling should start from `using-claw-kit`.
- root plan、subplan 与 template validation 不再因入口不同而漂移；新增模板来源或 schema 时只需扩展 `resolveSeedPlanTemplate(...)`。
- legacy project-local seed template 继续兼容，同时 skill-local full template 可以原样保留 tasks、`configOverride` 和 completion guidance。
- 父子 linkage 与模板解析职责分离，subplan 生命周期仍由 shared core ownership 管理。
- 回归测试必须同时覆盖 root/subplan 模板实例化、legacy seed 兼容、缺失模板错误、父子 linkage，以及 `choiceId` 对 `workflowGuidance.summary` 的影响。

## Related Code

- `shared/skills/planning/SKILL.md`
- `shared/skills/config/SKILL.md`
- `shared/skills/update/`
- `shared/skills/create-claw-skill/`
- `.agents/plugins/marketplace.json`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-planning-skill.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/install-codex-plugin.mjs`
- `scripts/install-codex-plugin.ps1`
- `scripts/publish-release.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `packages/codex-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `.gitignore`
- `packages/codex-adapter/skills/planning/`
- `packages/codex-adapter/skills/config/`
- `packages/codex-adapter/skills/update/`
- `packages/codex-adapter/skills/create-claw-skill/`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/core/src/plan-templates.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `shared/skills/update/TEMPLATE.json`
- `shared/skills/update/SKILL.md`
- `shared/skills/update/non-claw-fallback.md`
- `.claw/tasks/修复-Codex-插件-active-install-与-update-流程/plan.json`
- `.claw/tasks/fix-skill-local-subplan-template-resolution/plan.json`
- `.claw/tasks/让-planning-按复杂度选择验证与-closeout/plan.json`
- `.claw/tasks/发布共享技能-staging-修复并刷新本地运行时/plan.json`
- `.claw/archive/tasks/align-codex-plugin-publish-and-remote-install/plan.json`

## Search Terms

- `planning`
- `optional verification`
- `optional closure`
- `config`
- `shared skill source`
- `shared planning skill`
- `shared config skill`
- `shared skill staging`
- `Codex Git marketplace`
- `claw-kit@claw-kit`
- `claw-kit@claw-kit-local`
- `active identity`
- `marketplace source manifest`
- `cache-only installation`
- `loaded skill locator`
- `Codex restart`
- `packages/codex-adapter`
- `assertSharedSkillsSynced`
- `materialized plugin source`
- `GitHub Release ZIP optional`
- `repository marketplace ref`
- `source.path`
- `sparse checkout`
- `no npm lifecycle`
- `generated adapter skill`
- `complexity heuristic`
- `workflow admission`
- `recursive shared skill copy`
- `skill template fallback`
- `resolveSeedPlanTemplate`
- `createPlanFromTemplate`
- `SeedPlanTemplate`
- `full PlanDocument template`
- `configOverride`
- `guidance.onDone`
- `choiceId`
- `workflowGuidance.summary`
