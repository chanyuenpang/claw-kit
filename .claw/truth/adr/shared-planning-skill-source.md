# ADR: Shared source for host-neutral skills

## Status

Accepted

## Context

`claw-kit` now treats `planning` and `config` as generic host-neutral skills rather than host-specific claw runtime surfaces.
At the same time, both Codex and OpenCode plugin payloads still need physical skill files inside their own adapter directories so local skill loading and exported bundles continue to work.

Maintaining separate copies in adapter directories creates unnecessary drift, especially when only one copy is edited and the other is forgotten.

The final `0.1.49` release line extended this shared-source rule from `planning` to the user-facing `config` skill and verified that generated Codex/OpenCode adapter payloads stay synchronized from `shared/skills`.

The original synchronization implementation wrote those adapter-local copies into the checkout before bundling or installing. That made a normal local plugin refresh modify tracked source files, despite those files being generated artifacts. The `0.1.61` release replaces that checkout-writing path with temporary staging generation.

随后，`fix-skill-local-subplan-template-resolution` 计划进一步暴露了运行时边界：shared skill 的 `TEMPLATE.json` 是完整 `PlanDocument` 模板，而旧 `.claw/templates` 仍使用 `SeedPlanTemplate`。如果 `claw plan create` 与 `claw subplan create` 分别维护发现、schema 判别和实例化逻辑，同一个 skill-local 模板就会在 root plan 与 subplan 路径上产生不一致行为。

## Decision

Use shared sources for host-neutral skills, including future shared workflow skills that ship additional resources:

- canonical source: `shared/skills/planning/SKILL.md`
- canonical source: `shared/skills/config/SKILL.md`

Generate adapter-local copies from those sources only in the bundle/install staging directory:

- `packages/codex-adapter/skills/planning/SKILL.md`
- `packages/opencode-adapter/skills/planning/SKILL.md`
- `packages/codex-adapter/skills/config/SKILL.md`
- `packages/opencode-adapter/skills/config/SKILL.md`

When a shared skill is materialized into staging, copy its complete directory recursively rather than only `SKILL.md`. This preserves template manifests, fallback guidance, and other adjacent resources required by the skill contract.

Enforce synchronization automatically without mutating the checkout:

- `scripts/sync-shared-skills.mjs` writes generated copies to an explicitly supplied adapter directory
- `scripts/sync-planning-skill.mjs` remains as a compatibility wrapper
- Codex and OpenCode bundle export/install scripts copy the adapter source into a temporary staging directory, then call the sync step there before reading the plugin payload
- adapter `build` / `check` scripts validate the shared source and bundle result without generating adapter copies in the checkout
- generated adapter-local `planning` and `config` files are not tracked by Git

Keep the shared planning skill host-agnostic:

- it defines plan quality, decomposition, and scope-writing rules
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

- `claw plan create` 与 `claw subplan create` 都经由 `writePlan(...) -> createPlanFromTemplate(...) -> resolvePlanTemplate(...)` 完成模板发现、schema 判别和实例化。
- `resolvePlanTemplate(...)` 同时兼容 legacy `SeedPlanTemplate` 与 skill-local full `PlanDocument`；不得把 full template 强制降格为旧 seed schema，也不得为 subplan 复制一套平行 resolver。
- root plan 与 subplan 的差异发生在统一模板实例化之后。subplan 只追加 `parentPlan`、`parentTaskId`，并更新父任务 execution linkage；模板内容及其运行时语义保持不变。
- full template 的 `configOverride`、task `guidance.onDone` 与 `choiceId` 是运行时合同。choice 分支由 `claw plan edit --choice-id` 显式选择，CLI compact response 必须保留 `workflowGuidance.summary`。

## Consequences

- There is only one maintained source for each host-neutral shared skill going forward.
- Exported plugin bundles still retain adapter-local skill files, so no host runtime contract is broken.
- Plugin installation and export no longer leave generated skill changes in a developer checkout.
- The temporary staging directory is an intentional distribution boundary: it is the only location where adapter-local shared-skill copies are materialized for bundle or install work.
- A shared skill directory is an atomic distribution unit: the generated plugin must retain every required resource beside `SKILL.md`, not only the entry instruction file.
- Host/runtime-specific workflow rules remain separated from generic planning and config guidance.
- The complexity gate now has a single owner at workflow entry, so low-score tasks do not create drift by entering planning first and bypassing later.
- Future edits to planning quality or decomposition rules should start from `shared/skills/planning/SKILL.md`.
- Future edits to config routing or override-format guidance should start from `shared/skills/config/SKILL.md`.
- Edits to complexity admission, status semantics, or workflowGuidance handling should start from `using-claw-kit`.
- root plan 与 subplan 不再因入口不同而漂移；新增模板来源或 schema 时只需扩展统一 resolver。
- legacy project-local seed template 继续兼容，同时 skill-local full template 可以原样保留 tasks、`configOverride` 和 completion guidance。
- 父子 linkage 与模板解析职责分离，subplan 生命周期仍由 shared core ownership 管理。
- 回归测试必须同时覆盖 root/subplan 模板实例化、legacy seed 兼容、缺失模板错误、父子 linkage，以及 `choiceId` 对 `workflowGuidance.summary` 的影响。

## Related Code

- `shared/skills/planning/SKILL.md`
- `shared/skills/config/SKILL.md`
- `scripts/sync-shared-skills.mjs`
- `scripts/sync-planning-skill.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/opencode-plugin-bundle.mjs`
- `packages/codex-adapter/package.json`
- `packages/opencode-adapter/package.json`
- `.gitignore`
- `packages/codex-adapter/skills/using-claw-kit/SKILL.md`
- `packages/core/src/plan-templates.ts`
- `packages/core/src/plan.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/cli/src/cli.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `shared/skills/update/TEMPLATE.json`
- `.claw/tasks/fix-skill-local-subplan-template-resolution/plan.json`
- `.claw/tasks/发布共享技能-staging-修复并刷新本地运行时/plan.json`

## Search Terms

- `planning`
- `config`
- `shared skill source`
- `shared planning skill`
- `shared config skill`
- `shared skill staging`
- `generated adapter skill`
- `complexity heuristic`
- `workflow admission`
- `recursive shared skill copy`
- `skill template fallback`
- `resolvePlanTemplate`
- `createPlanFromTemplate`
- `SeedPlanTemplate`
- `full PlanDocument template`
- `configOverride`
- `guidance.onDone`
- `choiceId`
- `workflowGuidance.summary`
