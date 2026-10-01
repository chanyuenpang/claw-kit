# ADR: Shared source for host-neutral skills

## Status

Accepted

## Context

`claw-kit` treats `planning`, `config`, and `create-claw-skill` as shared skill packages rather than adapter-local authoring surfaces. `knowledge-writer` followed that model historically but is now a Core internal governance resource; `update` is an adapter-owned exception decided in `host-specific-update-skill-ownership`.
Installed Codex and OpenCode plugin payloads still need physical skill files inside their artifact directories so local skill loading and exported bundles continue to work.

Maintaining separate copies in adapter directories creates unnecessary drift, especially when only one copy is edited and the other is forgotten.

The final `0.1.49` release line extended this shared-source rule from `planning` to the user-facing `config` skill and verified that generated Codex/OpenCode adapter payloads stay synchronized from `shared/skills`.

`0.1.80` added the combined `knowledge-writer` package to that distribution contract. Its adjacent `TEMPLATE.json`, `non-claw-fallback.md`, and coverage metadata are part of the skill. At that point the top-level `scope: "session"` was also the primary recursion boundary for finalizer-driven harness use; the current executor-owned isolation is recorded below.

The original synchronization implementation wrote those adapter-local copies into the checkout before bundling or installing. That made a normal local plugin refresh modify tracked source files, despite those files being generated artifacts. The `0.1.61` release therefore moved generation into temporary staging.

`0.1.63` 进一步确认：临时 staging 不能作为 Codex Git marketplace 的唯一物化边界。Codex 官方 marketplace 从 Git 仓库复制 `source.path` 指向的插件目录，不会先运行仓库自定义同步脚本；如果 `packages/codex-adapter` 本身缺少 shared skill 或相邻资源，远端安装得到的就是不完整插件。release zip 即使完整，也不能证明 Git marketplace 源完整。

`研究 Codex 仓库安装与 claw-kit 插件物化规则` 进一步固定了分发边界：Git-backed marketplace 跟踪仓库 ref 对应的快照，从 marketplace manifest 解析相对 `source.path`，安装期间不执行仓库的 npm lifecycle 或自定义 build。只要已提交的 `packages/codex-adapter` 通过同步一致性 release gate，GitHub Release ZIP 就只是同一 payload 的可选快照，不是仓库 URL 安装的依赖。

`0.1.67` 将这个边界提升为正式发布协议：Codex 发布物就是通过 committed HEAD gate 的 Git repository marketplace 快照，GitHub Release 不再上传插件 ZIP。维护者运行时也统一启用正式 identity `claw-kit@claw-kit`；`claw-kit@claw-kit-local` 只保留为未启用的开发 source/cache，避免本机验证绕过正式 repository marketplace。

`修复 Codex 插件 active install 与 update 流程` 进一步确认：Codex 实际加载的插件由 active marketplace identity 及其 source 决定，versioned cache 中出现更高版本目录并不代表该版本已经生效。维护者开发安装如果只写 cache、没有刷新 `claw-kit@claw-kit-local` 对应的 local marketplace source，会留下“cache 已更新、active source 仍旧”的静默分叉；第三方更新也可能因为同名旧 identity 仍处于 active 状态而继续加载错误 payload。

`0.1.68` 本地 update subplan 再次验证这条边界：当前实际 enabled identity 是 `claw-kit@claw-kit`，而 maintained development installer 刷新的是未启用的 `claw-kit@claw-kit-local`。当 Windows Store `codex.exe` 无法执行、`codex plugin list` 不可用时，仍可先从 Codex 配置确认 active identity，再分别核对 official marketplace source manifest 与 official cache manifest；仅刷新 local cache 不能算 active surface 更新成功。

`0.1.69` 将维护者的仓库开发安装路径明确为另一种互斥模式：运行仓库 local installer 时，实际启用的 identity 应切到 `claw-kit@claw-kit-local`，并停用仍指向落后 source/cache 的 `claw-kit@claw-kit`。这不是用开发 cache 替代正式发布验证，而是要求当前 host 的 enabled identity、对应 source 和 versioned cache 始终属于同一安装面。磁盘三方对齐只能证明安装完成；Codex restart 后由新任务报告目标 loaded skill locator，才证明新 payload 已被运行时采用。

随后，`fix-skill-local-subplan-template-resolution` 计划进一步暴露了运行时边界：shared skill 的 `TEMPLATE.json` 是完整 `PlanDocument` 模板，而旧 `.claw/templates` 仍使用 `SeedPlanTemplate`。如果 `claw plan create` 与 `claw subplan create` 分别维护发现、schema 判别和实例化逻辑，同一个 skill-local 模板就会在 root plan 与 subplan 路径上产生不一致行为。

`优化 planning skill 的任务拆分与二次规划规则` 进一步确认，固定的 `1-3` task budget 会把计划质量错误地代理为数量控制，并诱导规划者在证据不足时提前填满后续步骤。可复用的边界不是 task 数量，而是一个阶段是否有可验收结果，并让后续工作能够继续或独立重试；当检查点本身决定下游路线时，一次性写完整计划反而会把猜测固化为任务。

2026-07-19 的 planning skill 质量 review 表明，当时的文案尚未可靠落实这项已接受决策：三处 `proposed solution` 确认要求会阻碍证据依赖的阶段性规划；复杂前向场景仍在 planning checkpoint 之后预建推测性执行 tasks；简单场景仍会把没有独立检查点价值的验证拆开。更晚的 current working-tree shared skill 文案已按同一既有决策收敛 solution gate、checkpoint 末端边界与 supporting-work 拆分规则，并把重复 trigger/质量说明合并：用户已指定 solution，或既有 workflow / 证据充分确定路线时可直接继续；否则先披露 decision-relevant content，并只在 meaningful choice 时等待回应。证据不足时由 decisive checkpoint 及其后续 planning task 充当该阶段 solution，而不是虚构最终实现。该 review 没有形成新的架构决策。default template 已对齐同一 solution gate；是否建立实施后 review lifecycle 的决策由 `cli-guided-plan-lifecycle.md` 拥有，shared skill 的 task-shape 状态和未重复运行的行为验证边界由 `.claw/truth/features/shared-planning-skill-source.md` 维护。

## Decision

Maintain one complete canonical package per public skill and assemble isolated artifacts without writing copies back to adapter source. [Shared-source Truth](<../features/shared-planning-skill-source.md>) owns the precise roots, host input matrix and current assembly behavior. Project discovery is the canonical authoring root for the seven project-visible packages; manual capture remains outside that discovery surface. Documentation entry and corpus form one complete package, while update stays adapter-owned and governance remains Core-internal.

Adapter declarations select whole packages, never host-pruned content. The same installed skill must retain every host route and adjacent resource so a project can move between hosts. Distribution identity does not select execution identity; [session-entry ADR](<using-claw-kit-session-entry.md>) owns trusted platform selection.

Keep installed flat skills, manifests, hooks, loaders, template discovery and runtime APIs unchanged. This is a source/build ownership change, not a root-plugin or Core runtime redesign. Every installed template reference must resolve within its package; supplemental repository authoring material cannot become a runtime dependency.

Git transport still requires a self-contained marketplace snapshot, but that snapshot is now an independently assembled artifact rather than generated files committed back to adapter source. Preserve Codex's marketplace-relative packages/codex-adapter layout and compose the full closure before publication. A raw checkout with missing skills is not installable merely because it contains marketplace metadata. Publishing its destination/ref requires explicit authorization; local export does not prove remote delivery. [Artifact release ownership](<artifact-specific-plugin-release-ownership.md>) owns Cindy's main-repository source and separate artifact remote.

Keep the shared planning skill host-agnostic:

- it defines plan quality, decomposition, and scope-writing rules
- keep operational planning behavior in `Planning principles`, and keep every criterion about what a good plan communicates in one `Quality bar`; do not duplicate that contract in a separate opening checklist
- choose verifiable progress checkpoints over a predefined task-count budget; split when the checkpoint leaves later work able to continue or the stage able to retry independently
- when current evidence cannot determine downstream execution reliably, end the initial plan at the decisive checkpoint and make an evidence-based second planning pass after it completes instead of inventing speculative tasks
- allow a user-specified solution or a route sufficiently determined by an established workflow or available evidence to proceed without redundant confirmation; before adopting another solution, expose its decision-relevant content and wait only when it introduces a meaningful choice. When downstream implementation depends on missing evidence, the decisive checkpoint and follow-up planning task are the current-stage solution
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
- 无 project root 时，显式 `claw plan create --template <id>` 仍须调用方显式选择 `--scope session`；否则 Core 返回 scope-decision guidance。同一显式 template 在已有 `.claw` 项目内保持 project scope，普通不带显式 template 的 plan create 继续初始化项目。skill entry 不重复拥有这项 storage routing。
- `resolveSeedPlanTemplate(...)` 同时兼容 legacy `SeedPlanTemplate` 与 skill-local full `PlanDocument`；不得把 full template 强制降格为旧 seed schema，也不得为 create、subplan 或 validate 复制平行 resolver。
- root plan 与 subplan 的差异发生在统一模板实例化之后。subplan 只追加 `parentPlan`、`parentTaskId`，并更新父任务 execution linkage；模板内容及其运行时语义保持不变。
- full template 的 `configOverride`、task `guidance.onDone` 与 `choiceId` 是运行时合同。choice 分支由 `claw task done --id <id> --choice <choice-id>` 或 `claw task edit --id <id> --status done --choice <choice-id>` 显式选择，CLI compact response 必须保留 `workflowGuidance.summary`；旧 `claw plan edit --choice-id` 不是 current surface。

## Alternatives

- 保留每宿主独立公共语义包：拒绝；重复修补已造成入口、模板和委派合同漂移。
- 只同步 SKILL.md 或仅共享抽象口号：拒绝；运行所需 references、模板、fallback、helper 必须随整包交付。
- 建立完整 host×skill 矩阵：拒绝；artifact membership 与公开注册是不同边界。
- 保留 adapter 源码镜像或安装时依赖仓库 build：拒绝；前者重复 ownership，后者不能满足 Git marketplace 的自包含交付。
- 迁移 Codex 根插件、扩展 Core template discovery 或按 host 裁剪技能：拒绝；去重不应改变运行时边界或破坏跨宿主使用。
- 只共享入口而漏掉 references/template/fallback：拒绝；完整目录是最小分发单元。
- 把 update 与 Core 内部 writer 一并公开共享：拒绝；安装/激活差异和 finalizer 生命周期各有独立 owner。
- 用 hostless shell 绕过 native 缺失能力：拒绝；技能文案不能制造 runtime 支持或转移 dispatch/Goal ownership。

## Consequences

- There is only one maintained source for each host-neutral shared skill going forward.
- 所有交付路径消费完整组装 artifact；source commit、artifact commit 与 runtime activation 必须分别取证。
- Git marketplace 不依赖用户端执行源码构建；发布前验证 detached artifact 的完整目录与字节一致性。
- sparse checkout 的最小边界由 marketplace manifest 和 `source.path` 联合决定，不能把 marketplace metadata 误当作完整 plugin payload。
- `0.1.69` 的历史结果曾让正式发布验收与第三方安装使用 `claw-kit@claw-kit`、显式仓库开发安装使用 `claw-kit@claw-kit-local`；该双 identity 维护者模式现已被 official-only 决策取代，未启用 identity 的 cache 仍不构成当前安装面证据。
- `0.1.69` 的 update 流程曾先识别 enabled identity 再选择验证路径；当前 update 不再选择 local route，只验证 official source/cache 与目标版本一致。
- Artifact validation 拒绝缺失资源、错误相对路径、陈旧输入和部分生成；不以修改 source 镜像修补 gate。
- restart/new-task locator check 成为插件运行时生效的最终证据，避免把既有任务中的旧 skill snapshot 误判为更新失败或更新成功。
- 维护者只编辑 canonical packages 与 adapter input declarations；原 sync-back 不再可用。
- Builds 必须保持源树不变；完整 exporter 保留旧有效产物或要求新目录，失败不能留下可误用的半包。
- 所有宿主都可在隔离 staging 组装；OpenCode 安装发现副本不重新成为源码。
- A shared skill directory is an atomic distribution unit: the generated plugin must retain every required resource beside `SKILL.md`, not only the entry instruction file.
- Session-scoped workflow metadata remains part of template-backed skill packages generally. Knowledge finalization is the explicit exception: its session template is a Core internal resource, not a shared or adapter skill contract; lifecycle ownership remains in `hook-owned-two-phase-knowledge-finalization.md`.
- Host/runtime-specific workflow rules remain separated from generic planning and config guidance.
- A single `Quality bar` makes the plan's goal, decision logic, decomposition rationale, sequencing, scope, risks, observable completion, and handoff criteria reviewable in one place; the rejected alternative is an opening `A good plan should answer` checklist that repeats the same contract and lets the two sections drift.
- Planning quality is reviewed against checkpoint value and evidence sufficiency, so coherent supporting edits and checks stay together unless they create an independently useful boundary; task count is allowed to vary with the work.
- A second planning pass after a decisive checkpoint is an intentional staged-planning outcome, not evidence that the initial plan was incomplete; the rejected alternative is speculative up-front decomposition beyond current evidence.
- 如果 skill 或 host bridge 文案未稳定实现上述 staged-planning 决策，应把它记录为实现/指令缺口，而不是弱化 ADR：初始 task list 的 planning checkpoint 之后不应预建依赖未知证据的执行 tasks；证据不足时仍需披露当前阶段 solution，而 meaningful choice 才要求等待用户，该 solution 是 decisive checkpoint route 而不是推测性的最终实现。当前 shared skill 与 host bridge 已在 solution gate 上对齐，task shape 与 evidence-dependent route 继续由 shared-planning Truth owner 维护。
- Planning does not create verification or closure tasks merely to satisfy a fixed stage template; those tasks appear only when the main agent chooses to include them for the work at hand.
- Project-plan admission has a single owner in the `using-claw-kit` entry contract, so planning never decides retroactively whether the request should have entered the formal workflow.
- Future edits to planning quality or decomposition rules should start from `.agents/skills/planning/SKILL.md`.
- Future edits to config routing or override-format guidance should start from `.agents/skills/config/SKILL.md`.
- Edits to project-plan admission, status semantics, or workflowGuidance handling start from the shared `using-claw-kit` entry and its adjacent host references, then regenerate declared targets. Adapter-local generated entries are not authoring owners.
- root plan、subplan 与 template validation 不再因入口不同而漂移；新增模板来源或 schema 时只需扩展 `resolveSeedPlanTemplate(...)`。
- Template-backed skills can use the same plan-create command inside or outside a project; Core owns the storage distinction, while explicit `--scope session` is the sole session-storage override mechanism.
- legacy project-local seed template 继续兼容，同时 skill-local full template 可以原样保留 tasks、`configOverride` 和 completion guidance。
- 父子 linkage 与模板解析职责分离，subplan 生命周期仍由 shared core ownership 管理。
- 回归测试必须同时覆盖 root/subplan 模板实例化、legacy seed 兼容、缺失模板错误、父子 linkage，以及 `choiceId` 对 `workflowGuidance.summary` 的影响。

## Related Code

- `DISTRIBUTION.md`
- `.agents/skills/planning/SKILL.md`
- `.agents/skills/config/SKILL.md`
- `.agents/skills/create-claw-skill/`
- `packages/core/resources/delegate-writer/`
- `packages/core/resources/knowledge-writer/`
- `.agents/plugins/marketplace.json`
- [Skill assembler](<../../../scripts/skill-artifacts.mjs>)
- [Host exporters](<../../../scripts/host-plugin-artifacts.mjs>)
- `scripts/codex-plugin-bundle.mjs`
- `scripts/install-codex-plugin.mjs`
- `scripts/install-codex-plugin.ps1`
- `scripts/publish-release.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `packages/codex-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `.gitignore`
- `packages/codex-adapter/skills/update/`
- `packages/opencode-adapter/skills/update/`
- [Entry source](<../../../.agents/skills/using-claw-kit/SKILL.md>)
- `packages/core/src/plan-templates.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `.claw/truth/adr/host-specific-update-skill-ownership.md`
- `.claw/truth/features/host-specific-update-skills.md`

## Official GitHub identity boundary

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

<!-- state: history -->
## Evolution history

<!-- dated: 2026-10-01 -->
### 公共语义整包共享，执行与分发边界保持显式

原先四技能共享、文档入口与 researcher 等由 adapter 维护的分工已被八整包共同源码取代。保留 host-specific update、Core 内部治理和显式发现矩阵，避免将去重误解为统一 transport 或自动扩展公开面。技能统一不承担补齐 DSH main-agent transport 的 runtime 工作。

<!-- dated: 2026-07-30 -->
### Knowledge governance moved from shared skill to Core internal resources

The earlier `knowledge-writer` package was synchronized into Codex/OpenCode skill discovery and used its own session-scoped template. The current design removes both public writer packages: a Core internal delegate template owns session scope, while a Core internal built-in governance contract is materialized by claim. External skills remain discoverable only when explicitly configured as assignments.

<!-- dated: 2026-07-16 -->
### 0.1.69 active identity/source contract superseded by official-only delivery

以下双 identity 切换规则只保留为 `0.1.69` 的版本化背景，不是当前安装或更新路线；当前行为由本文末尾的 official-only superseding decision 与 `.claw/truth/features/host-specific-update-skills.md` 共同约束。

- 正式 repository marketplace 安装与发布快照验证使用 `claw-kit@claw-kit`；仓库 local installer 驱动的维护者开发安装使用 `claw-kit@claw-kit-local`
- 两种 identity 不得同时抢占运行时加载结果；切换到 local 开发安装时必须停用 stale `claw-kit@claw-kit`，切回正式安装时也必须停用 local identity
- marketplace upgrade 后必须重新安装或启用正式 identity，并检测、处理会抢占加载结果的 stale same-name identity
- 安装或更新验收必须同时对齐 active identity、marketplace source manifest、cache manifest 与 target version，不能用 cache 目录存在或最高版本目录作为单独成功证据
- maintained development installer 的 `claw-kit@claw-kit-local` source/cache 与 active official `claw-kit@claw-kit` cache 是两个独立 surface；当 official identity 处于 enabled 状态时，必须通过 repository bundle/install 路径显式物化 matching official cache，不能把 local installer 成功当作 official runtime 已更新
- `codex plugin list` 不可用时，允许从 Codex 配置确认 enabled identity，但成功判定仍必须落到该 identity 对应的 source manifest、cache manifest 与 target version 三方一致
- 插件更新只有在 Codex restart 后，由新任务确认 loaded skill locator 时才算运行时生效；既有任务不承担 hot-reload 验证

<!-- dated: 2026-10-01 -->
### Replaced committed source mirrors with isolated complete artifacts

The earlier decision committed generated adapter skill trees because Git marketplace installation cannot run repository build steps. That runtime constraint remains, but no longer requires duplicated authoring-tree content: compose and publish the complete artifact separately. The proposed Codex repository-root plugin migration and Core discovery expansion were withdrawn; preserving the established installed layout is the accepted boundary. Host-pruned packages were rejected because installation origin cannot determine a later session's host.
