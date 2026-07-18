# Create Claw Skill Lessons

This note records the design lessons from introducing `create-claw-skill` as a real template-backed claw workflow.

The normal use case is helping a user who has installed claw-kit convert an ordinary text skill, or a skill idea, into a controlled `.claw` plan-template workflow in their own workspace.
For an existing skill, the default output shape is an in-place conversion of the specified skill package.

## What Changed

The settled version uses this shape:

- the authoring surface is a plan-like template
- workflow control lives in the template
- runtime plans persist only the lightweight execution state
- route recovery depends on `templateId`, numeric `task.id`, and optional `task.choiceId`

## Why The Template Should Stay Close To plan.json

Keeping template structure close to `plan.json` reduces translation overhead.

That matters because:

- authors can reason about one dominant shape
- docs become easier to write and maintain
- runtime compilation gets simpler
- template-specific control is easier to localize around each task

## What Should Live In rules

`rules` should stay short and durable.

Good `rules` are things that remain true even if task wording, branch structure, or examples change.

For `create-claw-skill`, good long-lived rules include:

- keep task ids numeric
- keep workflow control in the template
- let template own config override
- preserve the original skill text as an adjacent fallback document
- validate the generated template with `claw template validate --template <template-id>`

## What Belongs In references

Detailed explanation is usually a bad fit for `rules`.

These belong in referenced docs:

- how `guidance.onDone.default` works
- how `guidance.onDone.choices` should be used
- why `mergeMode` replaced legacy `mode`
- when to use branching versus linear guidance
- examples of route-aware completion

If too much explanation is embedded in `rules`, the template becomes noisy and harder to maintain.

## Why references Matter For create-claw-skill

`create-claw-skill` is a meta-skill.

It teaches users how to author more templates.

That makes references especially important because they can point to:

- the canonical template authoring guide
- this experience summary

This keeps the runtime template small while still giving authors enough context.

The converted entry and generated template should live together in the user's specified skill package.
Use `SKILL.md` for the thin entry and `TEMPLATE.json` for the claw workflow template.

## Core Experience From This Rollout

The most important lesson is that runtime behavior should be recovered from structured state.

That means:

- branches should come from `guidance.onDone.choices`
- chosen branches should be persisted as `task.choiceId`
- runtime guidance should be reconstructed from the template
- fallback behavior should be preserved directly in the converted skill package
- generated templates should be validated with the real CLI before the conversion is considered complete

If a template task defines `guidance.onDone.choices`, completion must record the selected `choiceId`.
The CLI rejects a done transition without that value and returns the allowed choices, which protects downstream guidance from guessing the wrong route.

## Recommended Shape For create-claw-skill

`create-claw-skill` should:

- start from a short claw entry skill
- route into `claw plan create --template create-claw-skill`
- use the template to control branch restoration and workflow guidance
- keep the original or distilled skill text as an adjacent fallback document
- validate the development-source template with `claw template validate --file <skill-dir>/TEMPLATE.json`
- include task-ownership routing in generated claw entry skills

## Task-ownership Routing

Every generated claw skill should ask what the skill completely owns:

- Whole task: use `claw plan create --template <template-id>` when the skill owns the task from inputs through verification.
- Independent stage: use `claw subplan create --parent <parent-task-name> --task-id <id> --template <template-id>` when the skill owns one complete stage of a broader plan.
- Mixed stage: use the adjacent fallback when the skill only contributes part of a stage whose owning workflow mixes multiple skills.

Batch belongs to the independent-stage route, not to a separate batch route. A batch is a broader plan with repeated stages; each stage calls the skill once as a subplan. The parent owns ordering and shared constraints, and each subplan owns one stage's complete result.

Mixed-skill work is different. If multiple skills must interleave inside the same stage and the current skill cannot produce a coherent stage result by itself, do not create a subplan for it. Keep one stage owner and consume the current skill's fallback there.

No-context execution does not need a separate entry route. When `cwd` has no `.claw`, `claw plan create --template <template-id>` automatically selects session scope. Plain `claw plan create "<title>"` retains its existing behavior and initializes `.claw`; the automatic session behavior applies only when a template is explicitly selected.

## Choices Need Observable Control Flow

Do not add choices only to label conversion styles. A valid choice changes the immediate downstream route, such as `apply -> task 2` and `report -> task 3`. This gives the Agent enough structure to persist `choiceId` and continue correctly.

If `simple`, `routing`, and `idea-first` all continue to task 2 and only alter prose advice, they are not real choices. Infer the shape from the source, record it in the task result, and use default guidance. Keep one concrete positive example and this counterexample in the authoring guide; schema names alone are not enough to teach reliable routing.

## Template Availability For Converted Skills

The generated skill entry is only safe if its template can be resolved where the skill will run.

For claw skills, prefer skill-local `TEMPLATE.json` beside `SKILL.md`.
The `id` inside `TEMPLATE.json` is still the value used by `claw plan create --template <template-id>`.
Use skill-local `TEMPLATE.json` for project-level templates that are not owned by one skill package.

Do not convert an installed/global skill so that its entry points at a template that only exists in the development repository.

## Fallback Document

The fallback should be the original skill text whenever possible.

If the source is only a user idea, first distill it into a concise direct skill document, then use that document as the fallback.
Treat it as a first-class output beside the claw entry and template. It is the normal input when the skill contributes only part of a mixed stage, and the complete direct workflow when the claw CLI or template is unavailable.

When the source skill has companion files, scripts, prompts, or references, preserve the needed files beside the fallback and update relative links so it remains usable when packaged.
For an existing skill, prefer replacing its `SKILL.md` with the claw entry and moving the original text to a same-directory fallback file such as `non-claw-fallback.md`.

## SKILL.md Supplements and Optional References

Do not assume every converted skill needs a separate knowledge layer.

Default split:

- the fallback preserves the original or direct plan-independent behavior
- `SKILL.md` keeps routing rules, non-template supplements, and any repeated high-signal constraints that deserve emphasis
- the template owns structured workflow control, deliverables, rules, and references

Only create extra reference files when the source still needs a focused referenced home that would make `SKILL.md` unwieldy or is naturally a helper document.

Good candidates include:

- tool contracts and exact command syntax
- route decision tables
- safety constraints with concrete cases
- helper-file inventories
- verification checklists
- copied prompts or helper docs that already work well as standalone files

Prefer a small number of focused reference files inside the converted skill package, for example `references/<skill-id>-tool-contract.md`, `references/<skill-id>-verification.md`, or `references/<skill-id>-helpers.md`.
Then add those files to the generated template `references` list with a clear `why`.
This keeps the claw skill self-contained without forcing an extra default `CLAW-KNOWLEDGE.md` layer.

## Content Coverage Check

The conversion should not be treated as a summary of the original skill.

The claw template only needs to hold the executable control surface, but the converted skill package as a whole should preserve the source behavior.
After `claw template validate` passes, run a separate content coverage check before claiming the conversion complete.
The check should map important source skill information to a converted home:

- `entry`
- `template.tasks`
- `template.guidance`
- `template.rules`
- `template.references`
- `fallback`

Use this coverage pass:

- triggers and route-selection rules are present in the claw entry or template guidance
- required tools, commands, and helper scripts remain reachable
- ordered workflow steps are represented as template tasks or guidance
- branch conditions are represented as `guidance.onDone.choices` when they affect control flow
- safety constraints and hard rules are in `rules` or the fallback
- routing rules and non-template supplements stay in `SKILL.md` when they help readability
- verification expectations are in task detail, guidance, or the fallback
- examples and long explanations are in references or the fallback
- relative links from the original skill still work after the in-place conversion

If a source detail is too verbose for `rules` or task detail but is important for claw execution, first ask whether it belongs directly in `SKILL.md`.
Only move it into a focused skill-local reference when that is clearly cleaner.
If a source detail only matters for direct fallback behavior, preserve it in the fallback document.
This keeps the plan lightweight without making the conversion lossy.

If a source detail is intentionally omitted, record why.
Otherwise, assume important source information must live somewhere in the converted package.

## Ongoing Maintenance Rule

When `create-claw-skill` evolves, prefer updating referenced docs before expanding `rules`.

If the template starts needing many explanatory rules again, that is usually a sign the knowledge should be moved back into references instead.
