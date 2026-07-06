# Template Authoring Guide

This guide describes the current plan-like template format used by `claw-kit`.

## Purpose

Templates are the authoring surface for reusable claw workflows.

The runtime `plan.json` should stay lightweight.
Template-only control should live in the template, then be recovered at runtime through:

- `plan.templateId`
- numeric `task.id`
- optional `task.choiceId`
- optional `plan.configOverride`

## Authoring Shape

A template should look close to a normal `plan.json`.

Top-level fields:

- `id`
- `configOverride`
- `title`
- `status`
- `goal`
- `requirements`
- `tasks`
- `references`
- `rules`
- `keyDecisions`
- `retrospective`

Important difference:

- template tasks may include template-only fields like `guidance`
- runtime tasks should not persist template-only guidance fields

## Task Rules

Task ids are numeric and should stay numeric.

Supported task-level control fields:

- `guidance.onDone.default`
- `guidance.onDone.choices`
- `goalModeDetail`

Use `guidance.onDone.default` when a task completion should alter the default returned workflow guidance without introducing a branch.

Use `guidance.onDone.choices.<choiceId>` when task completion is a real route-selection event.

## Route Selection

When a template task defines `guidance.onDone.choices`, completing that task is not a plain status change.

The caller must provide a route choice:

- `claw task done --task <task> --id <id> --choice <choiceId>`
- or `claw plan edit --task <task> --task-id <id> --task-status done --task-choice <choiceId>`

The selected route is persisted into runtime state as `task.choiceId`.

If a task defines `choices` and no `choiceId` is provided, completion fails and the CLI returns the available choices.
This protects downstream guidance from guessing the route after the task is already marked done.

## Guidance Merge Rules

Template guidance uses `mergeMode`, not legacy `mode`.

Supported values:

- `override`
- `replace`

`override`:

- keeps the default workflow guidance skeleton
- appends or replaces only the supplied fields

`replace`:

- discards the default workflow guidance body
- uses the template-defined guidance as the returned guidance body

## Config Override

`plan.configOverride` is template-owned.

It should not be injected ad hoc by `plan create`.

Use it when a specific template needs to override project behavior for the lifetime of that runtime plan, for example:

- `goalMode`
- `truthDispatch`
- external planning/truth/ADR skills

## References vs Rules

Use `rules` only for short, durable principles that should always apply during execution.

Examples:

- keep task ids numeric
- keep workflow control in the template
- preserve non-claw fallback directly

Use `references` for larger explanations, examples, migration notes, and design rationale.

If a template needs a lot of prose to explain how to use it, that prose should usually live in a referenced document, not inside `rules`.

References can point to original source material or to compiled knowledge produced during skill conversion.

A compiled knowledge reference is a distilled document created inside or beside the converted skill package.
Use it when the source skill contains important knowledge that is too verbose for `tasks`, `rules`, or `guidance`, but too important to leave buried only in the fallback.

Good compiled knowledge references include:

- tool contracts and required command shapes
- compact workflow notes extracted from long prose
- route decision tables
- safety constraints with examples
- verification and quality-check guidance
- companion-file inventories and relative-link notes

Prefer storing compiled knowledge in the generated skill package, for example:

- `references/<skill-id>-knowledge.md`
- `references/<skill-id>-tool-contract.md`
- `CLAW-KNOWLEDGE.md`

Then list that file in the generated template `references`.
This lets the claw skill reference its own distilled knowledge while keeping the runtime plan lightweight.

## Skill Information Preservation

When converting a text skill into a claw template, the template does not need to contain every word from the source skill.

Use this split instead:

- put executable workflow stages into `tasks`
- put route behavior into `guidance.onDone`
- put always-on constraints into `rules`
- put source examples, helper docs, scripts, prompts, long explanations, and distilled knowledge notes into `references`
- preserve the original or distilled skill text as the adjacent non-claw fallback document

The runtime `plan.json` is not the lossless source of truth for the converted skill.
The lossless package is the combination of the claw entry, the template, its references, and the adjacent fallback document.

Before completing a conversion, run a content coverage check.
This is separate from `claw template validate`: validation proves the template shape is legal, while content coverage proves the important source skill information was not lost.

Compare the source skill against the converted package and confirm that these source categories still have a home:

- trigger and routing rules
- required tool or CLI usage
- ordered workflow steps
- branching conditions
- safety constraints and "do not" rules
- required inputs, outputs, and acceptance criteria
- verification commands or quality gates
- companion files, scripts, examples, and relative links

If a source detail affects execution, it should be represented in the template or rules.
If it is explanatory but useful during normal claw execution, distill it into a compiled knowledge reference and list that document in `references`.
If it is fallback-only, it can remain only in the fallback document.
If it is neither executable nor explanatory, it should still remain in the fallback so the conversion is not destructive.

The content coverage check should produce a short mapping, even if it is only in the task closeout notes:

- `source item`: the important source skill information
- `converted home`: `entry`, `template.tasks`, `template.guidance`, `template.rules`, `template.references`, `compiled reference`, or `fallback`
- `status`: covered, intentionally fallback-only, or intentionally omitted with a reason

## Validation

Use the CLI to validate a template before relying on it:

```powershell
claw template validate --template <id>
claw template validate --file .claw/templates/<name>.json
```

Validation checks:

- top-level field shape
- task shape
- guidance field legality
- `mergeMode`
- `configOverride`

## Skill Entry Routing

Generated project claw entry skills should classify the request before entering their template:

- No `.claw` workspace: read and follow the adjacent fallback document.
- Direct single-target request: create a root plan with `claw plan create --template <template-id>`.
- Active parent-plan task: create a subplan with `claw subplan create --parent <parent-task-name> --task-id <id> --template <template-id>` when execution reaches the task.
- Batch or mixed request: create a normal root plan first, split work into one task per target skill or coherent skill-shaped unit, describe the intended skill/template in each task, and instantiate template subplans during task execution.

Subplans are created when a task is executed.
Root planning records the intent to use a claw skill; task execution creates the subplan that runs that skill's template.
Do not collapse a batch into one broad script that bypasses the template subplans unless the user explicitly asks to bypass claw skill orchestration.

## Template Availability

A generated skill entry that says `claw plan create --template <template-id>` depends on that template being available in the runtime workspace.

For project-local skills, storing the template in `.claw/templates/<template-id>.json` is enough.
For distributable plugins or global skills, the template must travel with the plugin or be copied into the user's `.claw/templates` by an install/sync step before the entry advertises the claw route.

Avoid converted skills whose entry points to a template that exists only in the development repository that created it.

## Recommended Authoring Style

- Keep visible runtime plans short.
- Put branching semantics into `guidance.onDone.choices`, not prose.
- Put stable invariant principles into `rules`.
- Put examples, rationale, and authoring advice into referenced docs.
- Prefer a small number of strong tasks over long procedural task lists.
