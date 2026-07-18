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
- `scope`
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

## Creation Scope

Set top-level `scope` to `"session"` when the template is an ephemeral workflow harness that must run without a project `.claw` directory and must not trigger project knowledge deposition.

Creation scope is resolved before the plan store exists, so it is a top-level template field rather than part of `configOverride`. When `claw plan create --template <id>` selects such a template, claw automatically uses the current platform session store. An explicit `--scope session` remains supported and takes precedence. Subplans inherit their parent plan's scope instead of switching stores from their own template declaration.

Omit `scope` for ordinary project-backed templates. `"session"` is currently the only accepted declared value.

The CLI also fills scope from the creation context:

- `claw plan create "<title>"` keeps the ordinary behavior and initializes `.claw` when needed.
- `claw plan create "<title>" --template <id>` automatically uses session scope when `cwd` is outside a `.claw` project.
- The same explicit template command remains project-scoped when `cwd` is inside a `.claw` project.
- Explicit `--scope session` and a template-declared `scope: "session"` still force session scope.

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
- or `claw task edit --id <id> --status done --choice <choiceId>`

The selected route is persisted into runtime state as `task.choiceId`.

If a task defines `choices` and no `choiceId` is provided, completion fails and the CLI returns the available choices.
This protects downstream guidance from guessing the route after the task is already marked done.

Do not rely on the word `choices` alone to teach route semantics. Include at least one concrete example whose options lead to different immediate tasks:

```json
{
  "id": 1,
  "title": "Choose the delivery route",
  "guidance": {
    "onDone": {
      "choices": {
        "apply": { "nextTaskId": 2, "summary": "Apply the change." },
        "report": { "nextTaskId": 3, "summary": "Produce a report only." }
      }
    }
  }
}
```

This is a real choice because `apply` and `report` change the immediate control flow. By contrast, options such as `simple`, `routing`, and `idea-first` are not choices when they all continue to task 2 and only change advice. Infer that conversion shape from the source, record it in the task result, and use `guidance.onDone.default` instead.

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
- external planning/truth/ADR skills

## Project Values In Guidance

Template `guidance` strings may reference effective `project.json` values by key path:

- `{{externalPlanningSkill}}`
- `{{maxTasksToKeep}}`
- `{{memory.embedding.model}}`
- custom variables declared under `project.json.var`, such as `{{var.releaseChannel}}`

Custom variables must stay inside the explicit `var` namespace so protocol repair can continue removing unknown or retired top-level configuration fields. Nested objects use dot paths. String, number, and boolean leaves render as text. Unknown paths, null values, arrays, and objects are rejected instead of being silently stringified. Project overrides and template `configOverride` participate in the effective values used for rendering. Runtime guidance variables remain available and take precedence over a same-named project key.

## References vs Rules

Use `rules` only for short, durable principles that should always apply during execution.

Examples:

- keep task ids numeric
- keep workflow control in the template
- preserve the adjacent fallback directly

Use `references` for larger explanations, examples, migration notes, and design rationale.

If a template needs a lot of prose to explain how to use it, that prose should usually live in a referenced document, not inside `rules`.

References can point to original source material or to skill-local supplemental files produced during skill conversion.

Default to keeping supplemental explanation in the converted `SKILL.md` when it helps routing, emphasizes a critical rule, or explains material that does not fit template structure cleanly.
Create extra reference files only when the source still needs a referenced home that would make `SKILL.md` unwieldy or would be better preserved as a focused helper document.

Good skill-local references include:

- tool contracts and required command shapes
- route decision tables
- safety constraints with examples
- verification and quality-check guidance
- companion-file inventories and relative-link notes
- focused helper docs or prompts copied from the source skill

Prefer focused files inside the generated skill package, for example:

- `references/<skill-id>-tool-contract.md`
- `references/<skill-id>-verification.md`
- `references/<skill-id>-helpers.md`

Then list those files in the generated template `references`.
This keeps the claw skill self-contained without inventing an extra default knowledge layer.

## Skill Information Preservation

When converting a text skill into a claw template, the template does not need to contain every word from the source skill.

Use this split instead:

- put executable workflow stages into `tasks`
- put route behavior into `guidance.onDone`
- put always-on constraints into `rules`
- keep route rules, repeated high-signal constraints, and non-template supplement material in `SKILL.md`
- put source examples, helper docs, scripts, prompts, long explanations, and optional focused reference files into `references`
- preserve the original or distilled skill text as the adjacent fallback document

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

If a source detail affects structured execution, it should be represented in the template or rules.
If it does not fit template structure but still helps normal claw execution, keep it in `SKILL.md` or place it in a focused skill-local reference and list that document in `references`.
If it is fallback-only, it can remain only in the fallback document.
If it is neither executable nor explanatory, it should still remain there so the conversion is not destructive.

The content coverage check should produce a short mapping, even if it is only in the task closeout notes:

- `source item`: the important source skill information
- `converted home`: `entry`, `template.tasks`, `template.guidance`, `template.rules`, `template.references`, or `fallback`
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

Named validation uses the same resolver as `claw plan create` and `claw subplan create`. Its output includes `choiceRequiredTasks`, so route-aware template authors can see which tasks require a choice id when they are completed.

## Skill Entry Routing By Task Ownership

Route a template-backed claw skill by what it completely owns:

- Whole task: if the skill fully carries the current task from inputs through verification, resolve the directory containing its loaded `SKILL.md` and create a root plan with `claw plan create --template-file "<skill-dir>/TEMPLATE.json"`.
- Independent stage: if the skill fully carries one stage of a broader plan, create a subplan with `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"` when that stage starts.
- Mixed stage: if the skill only contributes some instructions inside a stage that mixes multiple skills, do not create its template plan. Apply its adjacent fallback inside the owning workflow.

Batch is not a fourth route. Treat a batch as a broader plan containing repeated stages; each stage that is fully owned by the skill invokes one subplan. The parent plan owns ordering and shared constraints, while each subplan owns its stage from inputs through verification.

Outside a `.claw` project, use the same explicit template command. The CLI automatically selects session scope, so generated entries do not need a separate no-context command or a fallback-only route.

Call something an independent stage only when the skill can produce a coherent stage result. If several skills must interleave inside the same stage, keep one owning workflow and consume the others through their fallbacks. The same fallback must also remain directly executable when the claw CLI or template is unavailable.

## Template Availability

A generated skill entry should pass its adjacent `TEMPLATE.json` through `--template-file`, so the loaded skill owns the exact template source even when another skill or cached version uses the same template id.

For claw skills, store the workflow template beside the skill entry as `TEMPLATE.json`.
The `id` field remains the runtime template identity and supports compatibility lookup through `--template <id>` when no exact skill source is available.
Use skill-local `TEMPLATE.json` for project-level templates that are not owned by one skill package.

Avoid converted skills whose entry points to a template that exists only in the development repository that created it.

## Recommended Authoring Style

- Keep visible runtime plans short.
- Put branching semantics into `guidance.onDone.choices`, not prose.
- Put stable invariant principles into `rules`.
- Put examples, rationale, and authoring advice into referenced docs.
- Prefer a small number of strong tasks over long procedural task lists.
