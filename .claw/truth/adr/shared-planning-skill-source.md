# ADR: Shared source for host-neutral skills

## Status

Accepted

## Context

`claw-kit` treats `planning`, `config`, `create-claw-skill`, and `knowledge-writer` as shared skill packages rather than adapter-local authoring surfaces. `update` followed that model historically, but its current adapter-owned exception is decided in `host-specific-update-skill-ownership`.
At the same time, both Codex and OpenCode plugin payloads still need physical skill files inside their own adapter directories so local skill loading and exported bundles continue to work.

Maintaining separate copies in adapter directories creates unnecessary drift, especially when only one copy is edited and the other is forgotten.

The final `0.1.49` release line extended this shared-source rule from `planning` to the user-facing `config` skill and verified that generated Codex/OpenCode adapter payloads stay synchronized from `shared/skills`.

`0.1.80` added the combined `knowledge-writer` package to that distribution contract. Its adjacent `TEMPLATE.json`, `non-claw-fallback.md`, and coverage metadata are part of the skill: the top-level `scope: "session"` is required so the finalizer can use the claw harness without starting another project knowledge-deposition cycle.

The original synchronization implementation wrote those adapter-local copies into the checkout before bundling or installing. That made a normal local plugin refresh modify tracked source files, despite those files being generated artifacts. The `0.1.61` release therefore moved generation into temporary staging.

`0.1.63` 进一步确认：临时 staging 不能作为 Codex Git marketplace 的唯一物化边界。Codex 官方 marketplace 从 Git 仓库复制 `source.path` 指向的插件目录，不会先运行仓库自定义同步脚本；如果 `packages/codex-adapter` 本身缺少 shared skill 或相邻资源，远端安装得到的就是不完整插件。release zip 即使完整，也不能证明 Git marketplace 源完整。

`研究 Codex 仓库安装与 claw-kit 插件物化规则` 进一步固定了分发边界：Git-backed marketplace 跟踪仓库 ref 对应的快照，从 marketplace manifest 解析相对 `source.path`，安装期间不执行仓库的 npm lifecycle 或自定义 build。只要已提交的 `packages/codex-adapter` 通过同步一致性 release gate，GitHub Release ZIP 就只是同一 payload 的可选快照，不是仓库 URL 安装的依赖。

`0.1.67` 将这个边界提升为正式发布协议：Codex 发布物就是通过 committed HEAD gate 的 Git repository marketplace 快照，GitHub Release 不再上传插件 ZIP。维护者运行时也统一启用正式 identity `claw-kit@claw-kit`；`claw-kit@claw-kit-local` 只保留为未启用的开发 source/cache，避免本机验证绕过正式 repository marketplace。

`修复 Codex 插件 active install 与 update 流程` 进一步确认：Codex 实际加载的插件由 active marketplace identity 及其 source 决定，versioned cache 中出现更高版本目录并不代表该版本已经生效。维护者开发安装如果只写 cache、没有刷新 `claw-kit@claw-kit-local` 对应的 local marketplace source，会留下“cache 已更新、active source 仍旧”的静默分叉；第三方更新也可能因为同名旧 identity 仍处于 active 状态而继续加载错误 payload。

`0.1.68` 本地 update subplan 再次验证这条边界：当前实际 enabled identity 是 `claw-kit@claw-kit`，而 maintained development installer 刷新的是未启用的 `claw-kit@claw-kit-local`。当 Windows Store `codex.exe` 无法执行、`codex plugin list` 不可用时，仍可先从 Codex 配置确认 active identity，再分别核对 official marketplace source manifest 与 official cache manifest；仅刷新 local cache 不能算 active surface 更新成功。

`0.1.69` 将维护者的仓库开发安装路径明确为另一种互斥模式：运行仓库 local installer 时，实际启用的 identity 应切到 `claw-kit@claw-kit-local`，并停用仍指向落后 source/cache 的 `claw-kit@claw-kit`。这不是用开发 cache 替代正式发布验证，而是要求当前 host 的 enabled identity、对应 source 和 versioned cache 始终属于同一安装面。磁盘三方对齐只能证明安装完成；Codex restart 后由新任务报告目标 loaded skill locator，才证明新 payload 已被运行时采用。

随后，`fix-skill-local-subplan-template-resolution` 计划进一步暴露了运行时边界：shared skill 的 `TEMPLATE.json` 是完整 `PlanDocument` 模板，而旧 `.claw/templates` 仍使用 `SeedPlanTemplate`。如果 `claw plan create` 与 `claw subplan create` 分别维护发现、schema 判别和实例化逻辑，同一个 skill-local 模板就会在 root plan 与 subplan 路径上产生不一致行为。

`优化 planning skill 的任务拆分与二次规划规则` 进一步确认，固定的 `1-3` task budget 会把计划质量错误地代理为数量控制，并诱导规划者在证据不足时提前填满后续步骤。可复用的边界不是 task 数量，而是一个阶段是否有可验收结果，并让后续工作能够继续或独立重试；当检查点本身决定下游路线时，一次性写完整计划反而会把猜测固化为任务。

2026-07-19 的 planning skill 质量 review 表明，当时的文案尚未可靠落实这项已接受决策：三处 `proposed solution` 确认要求会阻碍证据依赖的阶段性规划；复杂前向场景仍在 planning checkpoint 之后预建推测性执行 tasks；简单场景仍会把没有独立检查点价值的验证拆开。更晚的 current working-tree shared skill 文案已按同一既有决策收敛 solution gate、checkpoint 末端边界与 supporting-work 拆分规则，并把重复 trigger/质量说明合并：当前阶段仍须确认 requirements 与 proposed solution，但在证据不足时由 decisive checkpoint 及其后续 planning task 充当该阶段 solution，而不是虚构最终实现。该 review 没有形成新的架构决策。default template 与 initial guidance 已对齐当前阶段 solution-discussion gate；是否建立实施后 review lifecycle 的决策由 `cli-guided-plan-lifecycle.md` 拥有，shared skill 的 task-shape 状态和未重复运行的行为验证边界由 `.claw/truth/features/shared-planning-skill-source.md` 维护。

## Decision

Use shared sources for host-neutral skills, including future shared workflow skills that ship additional resources:

- canonical source: `shared/skills/planning/SKILL.md`
- canonical source: `shared/skills/config/SKILL.md`
- canonical source: `shared/skills/create-claw-skill/`
- canonical source: `shared/skills/knowledge-writer/`

`update` is not a shared source. Its canonical sources are `packages/codex-adapter/skills/update/` and `packages/opencode-adapter/skills/update/`; see `host-specific-update-skill-ownership`.

Codex Git marketplace 的发布源必须是已提交、自包含的 `packages/codex-adapter` 插件树：

- `.agents/plugins/marketplace.json` 的 `source.path` 固定指向 `./packages/codex-adapter`
- 远程安装以通过 committed HEAD gate 的 Git-backed repository marketplace 快照为正式发布物；GitHub Release 不上传插件 ZIP
- marketplace 安装不得依赖 `npm install`、npm lifecycle、build 或同步脚本在目标机器上补全 payload
- Git checkout / sparse checkout 必须同时包含 marketplace manifest 及其 `source.path` 指向的 `packages/codex-adapter`；只取 `.agents/plugins` 的 sparse checkout 不构成完整安装源
- `packages/codex-adapter/skills/planning/`、`config/`、`update/`、`create-claw-skill/`、`knowledge-writer/` 必须在提交中包含完整目录及全部相邻资源；其中 `update/` 是 adapter-owned source，其余 listed shared skills 是 materialized payload
- `shared/skills` 仍是 shared packages 的规范维护源；维护者通过显式 `npm run sync:shared-skills` 更新派生副本，审查后连同源文件一起提交。该命令不得改写 adapter-owned `update/`
- release gate 必须从 committed HEAD 读取并核对 marketplace `source.path`、plugin manifest 版本以及必需的 materialized skill/resource 路径；工作区里尚未提交的生成结果不能让 gate 通过
- `scripts/publish-release.mjs` 通过 `assertSharedSkillsSynced(...)` 只读比较规范源与已物化副本；缺失、文件集合不完整或内容落后时必须失败
- `scripts/codex-plugin-bundle.mjs` 只能导出和安装当前 `packages/codex-adapter` 内容，不得在临时 staging 中隐式同步 shared skills 来掩盖仓库源缺失

### 0.1.69 历史 active identity/source 合同（已被下文 official-only 决策取代）

以下双 identity 切换规则只保留为 `0.1.69` 的版本化背景，不是当前安装或更新路线；当前行为由本文末尾的 official-only superseding decision 与 `.claw/truth/features/host-specific-update-skills.md` 共同约束。

- 正式 repository marketplace 安装与发布快照验证使用 `claw-kit@claw-kit`；仓库 local installer 驱动的维护者开发安装使用 `claw-kit@claw-kit-local`
- 两种 identity 不得同时抢占运行时加载结果；切换到 local 开发安装时必须停用 stale `claw-kit@claw-kit`，切回正式安装时也必须停用 local identity
- marketplace upgrade 后必须重新安装或启用正式 identity，并检测、处理会抢占加载结果的 stale same-name identity
- 安装或更新验收必须同时对齐 active identity、marketplace source manifest、cache manifest 与 target version，不能用 cache 目录存在或最高版本目录作为单独成功证据
- maintained development installer 的 `claw-kit@claw-kit-local` source/cache 与 active official `claw-kit@claw-kit` cache 是两个独立 surface；当 official identity 处于 enabled 状态时，必须通过 repository bundle/install 路径显式物化 matching official cache，不能把 local installer 成功当作 official runtime 已更新
- `codex plugin list` 不可用时，允许从 Codex 配置确认 enabled identity，但成功判定仍必须落到该 identity 对应的 source manifest、cache manifest 与 target version 三方一致
- 插件更新只有在 Codex restart 后，由新任务确认 loaded skill locator 时才算运行时生效；既有任务不承担 hot-reload 验证

OpenCode 等不通过 Codex Git marketplace 直接复制仓库插件树的适配器，可以继续在 bundle/install staging 中物化派生副本；这不改变 Codex marketplace 源必须已提交且自包含的约束。

When a shared skill is materialized, copy its complete directory recursively rather than only `SKILL.md`. This preserves template manifests, fallback guidance, and other adjacent resources required by the skill contract.

For every installed templated skill, each declared `TEMPLATE.json.references` target must resolve inside that skill package. Repository-only authoring documents may remain as supplemental maintainer guidance, but an installed workflow must not require them to execute or interpret its contract.

同步实现继续复用同一套显式工具，但生成动作与 release gate 分离：

- `scripts/sync-shared-skills.mjs` writes generated copies to explicitly selected adapter directories
- `scripts/sync-planning-skill.mjs` remains as a compatibility wrapper
- Codex 的同步命令是维护动作，Codex bundle/install/release verification 均不得隐式触发它
- release verification 只读验证完整目录集合和内容；验证失败时要求维护者显式同步、审查并提交
- OpenCode bundle/export 可以在临时 staging 中调用同步工具，不得反向改变 Codex marketplace 的提交要求

Keep the shared planning skill host-agnostic:

- it defines plan quality, decomposition, and scope-writing rules
- keep operational planning behavior in `Planning principles`, and keep every criterion about what a good plan communicates in one `Quality bar`; do not duplicate that contract in a separate opening checklist
- choose verifiable progress checkpoints over a predefined task-count budget; split when the checkpoint leaves later work able to continue or the stage able to retry independently
- when current evidence cannot determine downstream execution reliably, end the initial plan at the decisive checkpoint and make an evidence-based second planning pass after it completes instead of inventing speculative tasks
- require the current-stage requirements and proposed solution to be discussed and confirmed; when downstream implementation depends on missing evidence, the decisive checkpoint and follow-up planning task are the current-stage solution
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
- 无 project root 时，显式 `claw plan create --template <id>` 自动使用 session scope；同一显式 template 在已有 `.claw` 项目内保持 project scope，普通不带显式 template 的 plan create 继续初始化项目。skill entry 不重复拥有这项 storage routing。
- `resolveSeedPlanTemplate(...)` 同时兼容 legacy `SeedPlanTemplate` 与 skill-local full `PlanDocument`；不得把 full template 强制降格为旧 seed schema，也不得为 create、subplan 或 validate 复制平行 resolver。
- root plan 与 subplan 的差异发生在统一模板实例化之后。subplan 只追加 `parentPlan`、`parentTaskId`，并更新父任务 execution linkage；模板内容及其运行时语义保持不变。
- full template 的 `configOverride`、task `guidance.onDone` 与 `choiceId` 是运行时合同。choice 分支由 `claw task done --id <id> --choice <choice-id>` 或 `claw task edit --id <id> --status done --choice <choice-id>` 显式选择，CLI compact response 必须保留 `workflowGuidance.summary`；旧 `claw plan edit --choice-id` 不是 current surface。

## Consequences

- There is only one maintained source for each host-neutral shared skill going forward.
- Codex Git marketplace、release bundle 和维护者本地安装都从同一棵已提交的 `packages/codex-adapter` 读取，不再出现“zip 完整但远端 Git 安装缺 skill”的分叉。
- 仓库 URL 安装不需要 GitHub Release ZIP，也不依赖目标机器执行仓库构建；发布正确性由 committed plugin tree 与只读 HEAD gate 保证。
- sparse checkout 的最小边界由 marketplace manifest 和 `source.path` 联合决定，不能把 marketplace metadata 误当作完整 plugin payload。
- `0.1.69` 的历史结果曾让正式发布验收与第三方安装使用 `claw-kit@claw-kit`、显式仓库开发安装使用 `claw-kit@claw-kit-local`；该双 identity 维护者模式现已被 official-only 决策取代，未启用 identity 的 cache 仍不构成当前安装面证据。
- `0.1.69` 的 update 流程曾先识别 enabled identity 再选择验证路径；当前 update 不再选择 local route，只验证 official source/cache 与目标版本一致。
- HEAD gate 可阻止未提交的物化文件、错误 `source.path`、manifest 版本漂移或缺失相邻资源进入正式发布。
- restart/new-task locator check 成为插件运行时生效的最终证据，避免把既有任务中的旧 skill snapshot 误判为更新失败或更新成功。
- `shared/skills` 保持 host-neutral shared packages 的单一规范维护源，同时 Codex adapter 的派生副本成为需要审查和提交的发布资产；adapter-owned `update` 不属于该派生集合。
- release gate 发现未同步时直接失败；bundle 导出不再通过临时生成制造假阳性。
- OpenCode 仍可把 temporary staging 作为自身分发边界，而不会弱化 Codex marketplace 的自包含要求。
- A shared skill directory is an atomic distribution unit: the generated plugin must retain every required resource beside `SKILL.md`, not only the entry instruction file.
- Session-scoped workflow metadata is part of the distributed skill contract: stripping or rewriting `knowledge-writer/TEMPLATE.json` would reintroduce project finalization recursion or make projectless entry fail.
- Host/runtime-specific workflow rules remain separated from generic planning and config guidance.
- A single `Quality bar` makes the plan's goal, decision logic, decomposition rationale, sequencing, scope, risks, observable completion, and handoff criteria reviewable in one place; the rejected alternative is an opening `A good plan should answer` checklist that repeats the same contract and lets the two sections drift.
- Planning quality is reviewed against checkpoint value and evidence sufficiency, so coherent supporting edits and checks stay together unless they create an independently useful boundary; task count is allowed to vary with the work.
- A second planning pass after a decisive checkpoint is an intentional staged-planning outcome, not evidence that the initial plan was incomplete; the rejected alternative is speculative up-front decomposition beyond current evidence.
- 如果 skill 或 host bridge 文案未稳定实现上述 staged-planning 决策，应把它记录为实现/指令缺口，而不是弱化 ADR：初始 task list 的 planning checkpoint 之后不应预建依赖未知证据的执行 tasks；证据不足时仍需确认当前阶段 solution，但该 solution 是 decisive checkpoint route，而不是推测性的最终实现。当前 shared skill 与 host bridge 已在 solution-discussion gate 上对齐，task shape 与 evidence-dependent route 继续由 shared-planning Truth owner 维护。
- Planning does not create verification or closure tasks merely to satisfy a fixed stage template; those tasks appear only when the main agent chooses to include them for the work at hand.
- Project-plan admission has a single owner in the `using-claw-kit` entry contract, so planning never decides retroactively whether the request should have entered the formal workflow.
- Future edits to planning quality or decomposition rules should start from `shared/skills/planning/SKILL.md`.
- Future edits to config routing or override-format guidance should start from `shared/skills/config/SKILL.md`.
- Edits to project-plan admission, status semantics, or workflowGuidance handling should start from the host-specific `using-claw-kit` entry skills.
- root plan、subplan 与 template validation 不再因入口不同而漂移；新增模板来源或 schema 时只需扩展 `resolveSeedPlanTemplate(...)`。
- Template-backed skills can use the same plan-create command inside or outside a project; core owns the storage distinction, while explicit `--scope session` and template-declared session scope remain override mechanisms.
- legacy project-local seed template 继续兼容，同时 skill-local full template 可以原样保留 tasks、`configOverride` 和 completion guidance。
- 父子 linkage 与模板解析职责分离，subplan 生命周期仍由 shared core ownership 管理。
- 回归测试必须同时覆盖 root/subplan 模板实例化、legacy seed 兼容、缺失模板错误、父子 linkage，以及 `choiceId` 对 `workflowGuidance.summary` 的影响。

## Related Code

- `DISTRIBUTION.md`
- `shared/skills/planning/SKILL.md`
- `shared/skills/config/SKILL.md`
- `shared/skills/create-claw-skill/`
- `shared/skills/knowledge-writer/`
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
- `packages/opencode-adapter/skills/update/`
- `packages/codex-adapter/skills/create-claw-skill/`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/core/src/plan-templates.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `.claw/truth/adr/host-specific-update-skill-ownership.md`
- `.claw/truth/features/host-specific-update-skills.md`
- `.claw/tasks/修复-Codex-插件-active-install-与-update-流程/plan.json`
- `.claw/tasks/发布新版本并更新本地安装/Run-a-update-subplan,-complete-refresh-the-published-CLI-and-the-current-host-plugin-install-surface-after-a-newer-version-is-detected.json`
- `.claw/tasks/fix-skill-local-subplan-template-resolution/plan.json`
- `.claw/tasks/让-planning-按复杂度选择验证与-closeout/plan.json`
- `.claw/tasks/发布共享技能-staging-修复并刷新本地运行时/plan.json`
- `.claw/archive/tasks/align-codex-plugin-publish-and-remote-install/plan.json`

## 2026-07-17 superseding decision: official GitHub identity only

The previous dual-surface maintainer model is superseded. Release and update workflows must no longer install or validate `claw-kit@claw-kit-local` as an active surface.

- Publish and verify the new GitHub/npm version before invoking the update skill.
- Use the published `chanyuenpang/claw-kit` repository marketplace for maintainer and third-party Codex updates alike.
- Enable only `claw-kit@claw-kit`; explicitly disable `claw-kit@claw-kit-local`.
- Treat unpublished workspace payloads and local marketplace caches as invalid release evidence.
- Keep the official Git checkout/marketplace path as the default transport. If a full clone stalls during `index-pack` and a clean checkout from the same official GitHub origin already exists, prefer a filtered shallow fetch (`--depth=1 --filter=blob:none`) that preserves the official checkout identity while reducing pack transfer. Accept it only after marketplace HEAD, source/cache manifests, enabled appserver identity, and source/cache payload comparison all converge on the published target.
- If that checkout cannot be recovered, an official GitHub branch archive may substitute only as a narrower transport fallback: verify the archive's plugin manifest against the already-published target, then install that verified payload through the maintained official cache/identity installer and retain the same identity, manifest, and payload comparisons.

This recovery is intentionally narrower than accepting an arbitrary directory. The rejected alternatives are using unpublished workspace files, switching to a local marketplace, or treating an unverified archive/cache directory as activation evidence. The trust boundary remains the published GitHub source plus target manifest, enabled official identity, and matching source/cache payload; the mere presence of `.git` metadata is not the trust boundary. Current operational behavior is owned by `.claw/truth/features/host-specific-update-skills.md`.

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
- `official cache materialization`
- `codex plugin list unavailable`
- `enabled identity from config`
- `loaded skill locator`
- `Codex restart`
- `exclusive plugin identity`
- `stale identity disable`
- `packages/codex-adapter`
- `assertSharedSkillsSynced`
- `materialized plugin source`
- `GitHub Release ZIP optional`
- `GitHub Release without assets`
- `committed HEAD gate`
- `repository marketplace ref`
- `filtered shallow fetch`
- `index-pack recovery`
- `source.path`
- `sparse checkout`
- `no npm lifecycle`
- `only enabled identity`
- `generated adapter skill`
- `complexity heuristic`
- `verifiable progress checkpoint`
- `predefined task count`
- `second planning pass`
- `proposed solution confirmation`
- `planning checkpoint terminal boundary`
- `verification task over-splitting`
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
