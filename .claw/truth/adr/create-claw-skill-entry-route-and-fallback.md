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
- Keep `create-claw-skill` entry routing free of storage scope. Explicit template creation outside a `.claw` project relies on the core resolver's automatic session scope; plain plan creation keeps project initialization semantics.
- Preserve direct, plan-independent behavior in an adjacent fallback document. For `create-claw-skill` itself and generated packages by default, that document is `FALLBACK.md`; `--fallback-doc` may configure another adjacent filename.
- Keep the visible entry thin and let `TEMPLATE.json` own conversion tasks, guidance, rules, references, and verification.
- Use `guidance.onDone.choices` only for a real route-selection event whose selected value changes the immediate downstream task or route. If all options continue to the same task and only alter advice, infer the shape from evidence and use default guidance.
- Validate a template under development with `claw template validate --file <skill-dir>/TEMPLATE.json`; reserve named `--template <id>` validation for a template already materialized in a supported registry.

## Consequences

- Whole-task, stage, and partial-capability boundaries determine plan, subplan, and fallback use without a parallel invocation-shape taxonomy.
- Batch orchestration remains in the parent plan while each conversion stage retains complete subplan ownership.
- A skill that cannot independently finish a stage no longer creates a misleading subplan merely because it was explicitly invoked.
- The template no longer requires a `choiceId` for `simple`, `routing`, or `idea-first` labels that all enter the same execution task.
- Generator and authoring guidance can present the short `--skill-name` plus `--out` path and omit manual scope routing.
- Storage-scope semantics remain owned by the shared plan/template resolver contract, and general choice semantics remain owned by the template-guidance contract.

## Related Code

- `shared/skills/create-claw-skill/SKILL.md`
- `shared/skills/create-claw-skill/TEMPLATE.json`
- `shared/skills/create-claw-skill/FALLBACK.md`
- `shared/skills/create-claw-skill/scripts/create-claw-skill-stub.mjs`
- `packages/codex-adapter/skills/create-claw-skill/`
- `packages/opencode-adapter/skills/create-claw-skill/`
- `packages/core/src/plan.ts`
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
