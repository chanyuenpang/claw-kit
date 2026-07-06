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
- validate the generated template with `claw template validate --template <template-id>`
- include the standard claw skill entry routing section in generated claw entry skills

## Standard Entry Routing

Every generated project claw entry skill should classify the request before entering its template:

- No `.claw` workspace: read and follow the adjacent fallback document.
- Direct single-target request: call `claw plan create --template <template-id> --title "<target>"`.
- Active parent-plan task: when execution reaches a task whose description asks to use this claw skill, call `claw subplan create --parent <parent-task-name> --task-id <id> --template <template-id>`.
- Batch or mixed request: first create a normal root claw plan, split the work into one task per target skill or coherent skill-shaped unit, describe the intended conversion in each task, and defer subplan creation until execution reaches the corresponding task.

The batch or mixed route should remain inside every generated claw skill entry.
It should be a standard reusable block, not a fresh workflow design for each skill.
When compiling a skill, substitute the generated skill name, template id, and target-work wording into the standard block.

Subplans are execution-time expansions.
Root planning should describe the skill intent in the task, while the task execution step instantiates the template subplan.

This keeps single-target skill workflows compact and lets batch or mixed workflows use the same skill templates without turning each skill template into its own batch framework.
It also prevents the agent from replacing the template workflow with one broad conversion script.

For batch conversion, keep the root route orchestration-oriented.
The root plan may define target ordering, naming conventions, shared output boundaries, and batch-level risks.
Reusable helpers are allowed as implementation aids, but they should not replace each target's execution-time subplan, validation, and content coverage check.
The standard claw path is: root task runs a `create-claw-skill` subplan for one target, and that subplan performs the individual conversion.

Use a clear root task contract.
The subtask title and detail should carry the subplan requirement directly; do not rely on only the top-level skill instructions to remind the agent.

Recommended title:

`Run a create-claw-skill subplan, convert <skill-name>`

Recommended detail:

`Goal: run a create-claw-skill subplan to convert <source-skill-path> into a claw skill. This subtask is satisfied by creating and completing that target subplan, not by running the claw skill workflow in the root plan. When executing this task, first run claw subplan create --parent <root-task-name> --task-id <id> --template create-claw-skill, then follow the returned workflowGuidance inside that subplan until the subplan completes. The root plan records the subplan result and marks this task done after the subplan result is incorporated. Keep target-specific source analysis, file edits, template validation, and content coverage inside the target subplan.`

For generated skills, use the generic form:

- title: `Run a <generated-skill-name> subplan, complete <target-work>`
- detail: `Goal: run the <generated-skill-name> subplan to complete <target-work>. This task is satisfied by creating and completing that target subplan. First run claw subplan create --parent <root-task-name> --task-id <id> --template <template-id>, then follow the returned workflowGuidance inside that subplan until it completes. Record the subplan result in the root plan before marking this task done.`

The root plan should not analyze every source skill or write generated outputs for all targets.
After creating the per-target task list and any necessary batch-level conventions, it should move quickly into execution and let each task's subplan own the actual conversion.

## Template Availability For Converted Skills

The generated skill entry is only safe if its template can be resolved where the skill will run.

For claw skills, prefer skill-local `TEMPLATE.json` beside `SKILL.md`.
The `id` inside `TEMPLATE.json` is still the value used by `claw plan create --template <template-id>`.
Use skill-local `TEMPLATE.json` for project-level templates that are not owned by one skill package.

Do not convert an installed/global skill so that its entry points at a template that only exists in the development repository.

## Fallback Skill Document

The fallback document should be the original skill text whenever possible.

If the source is only a user idea, first distill it into a concise direct skill document, then use that document as the fallback.
Treat the fallback as a first-class output beside the claw entry and template.

When the source skill has companion files, scripts, prompts, or references, preserve the needed files beside the fallback and update relative links so the fallback remains usable when packaged.
For an existing skill, prefer replacing its `SKILL.md` with the claw entry and moving the original text to a same-directory fallback file such as `non-claw-fallback.md`.

## Compiled Knowledge References

Because plan references are links instead of inline text, `create-claw-skill` can safely produce extra reference documents during compilation.

Use compiled knowledge references for important source knowledge that should be available during normal claw execution but would make the template too noisy.
This is different from the fallback document:

- the fallback preserves the original or direct non-claw behavior
- the compiled knowledge reference distills the parts a claw-running agent should consult quickly

Good candidates include:

- tool contracts and exact command syntax
- route decision tables
- examples that clarify how to execute a task
- safety constraints with concrete cases
- helper-file inventories
- verification checklists

Prefer a small number of focused reference files inside the converted skill package, for example `references/<skill-id>-knowledge.md`, `references/<skill-id>-tool-contract.md`, or `CLAW-KNOWLEDGE.md`.
Then add those files to the generated template `references` list with a clear `why`.
This makes the claw skill self-contained: the entry stays short, the fallback preserves the original behavior, and the template can reference back into the skill package for distilled execution knowledge.

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
- `compiled reference`
- `fallback`

Use this coverage pass:

- triggers and route-selection rules are present in the claw entry or template guidance
- required tools, commands, and helper scripts remain reachable
- ordered workflow steps are represented as template tasks or guidance
- branch conditions are represented as `guidance.onDone.choices` when they affect control flow
- safety constraints and hard rules are in `rules` or the fallback
- verification expectations are in task detail, guidance, or the fallback
- examples and long explanations are in references or the fallback
- relative links from the original skill still work after the in-place conversion

If a source detail is too verbose for `rules` or task detail but is important for claw execution, distill it into a compiled knowledge reference.
If a source detail only matters for non-claw fallback behavior, preserve it in the fallback.
This keeps the plan lightweight without making the conversion lossy.

If a source detail is intentionally omitted, record why.
Otherwise, assume important source information must live somewhere in the converted package.

## Ongoing Maintenance Rule

When `create-claw-skill` evolves, prefer updating referenced docs before expanding `rules`.

If the template starts needing many explanatory rules again, that is usually a sign the knowledge should be moved back into references instead.
