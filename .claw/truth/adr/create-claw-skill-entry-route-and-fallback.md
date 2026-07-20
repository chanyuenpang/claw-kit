# ADR: `create-claw-skill` task-ownership route and fallback contract

## Status

Accepted; supersedes the earlier direct / parent-task / batch-mixed route classification in this document.

## Context

The earlier entry contract classified invocation shapes: direct single target, active parent-plan task, and batch or mixed request. The template then introduced a second `simple` / `routing` / `idea-first` choice even though every option continued to the same task. That made callers classify the request twice without changing immediate control flow, and it conflated batch orchestration with work that genuinely mixes multiple skills inside one stage.

The skill also exposed storage concerns that belong to core plan creation. A template-backed skill should express what result it owns; it should not make callers choose project/session storage or treat the absence of `.claw` as a separate skill route. The completed plan called the plan-independent document “raw skill”; the later current implementation retained that role but standardized its package name as `FALLBACK.md`.

## Decision

- Route a template-backed skill by task ownership:
  - use a root plan when the skill completely owns the whole current task;
  - use a subplan when the skill completely owns one independent stage of a broader plan;
  - use the adjacent fallback directly when the skill contributes only part of a mixed stage and cannot independently own that stage's result.
- Treat batch work as repeated independently owned stages. The root plan owns batch ordering and shared constraints; each stage invokes the skill once as a subplan.
- Do not classify batch as mixed work. “Mixed” means multiple skills must interleave within one stage under a different owning workflow.
- Apply the canonical exact-source routing decision to this skill: resolve the loaded `SKILL.md` directory and pass its adjacent `TEMPLATE.json` through `--template-file` for both root-plan and subplan entry. The `create-claw-skill` template id remains a compatibility discovery key, not the authoritative loaded-skill source.
- Keep `create-claw-skill` entry routing free of storage scope. Explicit template creation outside a `.claw` project relies on the core resolver's automatic session scope; plain plan creation keeps project initialization semantics.
- Preserve direct, plan-independent behavior in an adjacent fallback document. For `create-claw-skill` itself and generated packages by default, that document is `FALLBACK.md`; `--fallback-doc` may configure another adjacent filename.
- Keep the visible entry thin and let `TEMPLATE.json` own conversion tasks, guidance, rules, references, and verification.
- Use `guidance.onDone.choices` only for a real route-selection event whose selected value changes the immediate downstream task or route. If all options continue to the same task and only alter advice, infer the shape from evidence and use default guidance.
- Validate a template under development with `claw template validate --file <skill-dir>/TEMPLATE.json`; reserve named `--template <id>` validation for a template already materialized in a supported registry.
- Make top-level `TEMPLATE.json.version` a compatibility gate tied to the current CLI template contract. The exact current rejection behavior and diagnostics are owned by `.claw/truth/features/create-claw-skill-entry-contract.md`; the decision here is that remediation requires a full package inspection and optimization before advancing the version, not a field-only bump.
- Keep the primary compatibility error concise and actionable while retaining troubleshooting data in structured details. The exact current message and detail values remain owned by `.claw/truth/features/create-claw-skill-entry-contract.md`; the `create-claw-skill` package owns the upgrade procedure through its entry and adjacent `references/template-upgrade.md`, instead of expanding the runtime error into the procedure itself.
- Have `create-claw-skill` generated templates inherit the current claw package semver, and expose the normalized version in successful `claw template validate` output so authoring and validation share an observable contract.
- Generated packages must inherit the canonical route-aware completion contract from `template-guidance-routing-and-config-override.md`: real choices are discoverable only through `completionChoices`, guidance provides one parameterized `--choice <choice>` command template without repeating ids in `nextsteps`, and internal `choiceId` terminology is not presented as a CLI flag. This ADR does not create a second owner for the general choice semantics.

## Consequences

- Whole-task, stage, and partial-capability boundaries determine plan, subplan, and fallback use without a parallel invocation-shape taxonomy.
- Batch orchestration remains in the parent plan while each conversion stage retains complete subplan ownership.
- A skill that cannot independently finish a stage no longer creates a misleading subplan merely because it was explicitly invoked.
- The template no longer requires a `choiceId` for `simple`, `routing`, or `idea-first` labels that all enter the same execution task.
- Generator and authoring guidance can present the short `--skill-name` plus `--out` path and omit manual scope routing.
- Generated entries select the exact adjacent template even when another installed skill or cached version reuses the same template id.
- Stale unrelated cached templates no longer block a different selected template, while an explicitly selected stale template cannot silently run against a newer CLI contract.
- Template upgrades cost a deliberate package review, but avoid falsely blessing stale workflow, guidance, or validation semantics through a mechanical version edit.
- Callers receive a short recovery route at the failure boundary, while machine-readable diagnostics and the maintained skill-local checklist preserve the detail needed for troubleshooting and migration.
- New generated packages and file-based validation surface the same version contract, making compatibility drift visible before materialization into a runtime registry.
- Generated route-aware templates remain directly operable from compact guidance instead of requiring callers to inspect template JSON or translate `choiceId` into CLI syntax.
- Storage-scope semantics remain owned by the shared plan/template resolver contract, and general choice semantics remain owned by the template-guidance contract.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-07-20 -->
### Use a matching CLI only to finish an already-created older plan

The `0.1.87` installation-update closeout encountered an already-created `0.1.86` update plan whose template contract could not be mutated by CLI `0.1.87`. For that existing plan only, the workflow temporarily used the matching published `0.1.86` CLI to perform its remaining canonical plan mutations, then restored CLI `0.1.87` after the plan reached completion.

This is a compatibility recovery for preserving an in-flight historical plan, not an alternative template-upgrade route. New or maintained skill packages still follow the current decision above: inspect and optimize the package through `create-claw-skill` before advancing its template version. Keeping the older CLI active, editing the source plan inputs, or treating a field-only version bump as remediation remain rejected alternatives.

## Related Code

- `shared/skills/create-claw-skill/SKILL.md`
- `shared/skills/create-claw-skill/TEMPLATE.json`
- `shared/skills/create-claw-skill/FALLBACK.md`
- `shared/skills/create-claw-skill/scripts/create-claw-skill-stub.mjs`
- `packages/codex-adapter/skills/create-claw-skill/`
- `packages/opencode-adapter/skills/create-claw-skill/`
- `packages/core/src/plan.ts`
- `packages/core/src/plan-templates.ts`
- `packages/core/src/templates/plans/default.ts`
- `packages/cli/src/cli.ts`
- `docs/create-claw-skill-lessons.md`
- `docs/template-authoring-guide.md`

## Search Terms

- `create-claw-skill`
- `task ownership routing`
- `whole task`
- `independent stage`
- `mixed stage`
- `plan-independent fallback`
- `batch repeated stages`
- `template version compatibility`
- `requiredSkill`
- `stale template`
