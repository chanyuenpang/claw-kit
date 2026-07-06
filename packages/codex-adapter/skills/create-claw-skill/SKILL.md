---
name: create-claw-skill
description: Use when a user wants to convert a specified text skill or skill idea into a claw-template-backed skill in the same skill package, with template-owned workflow guidance and an adjacent fallback document.
---
<!-- AUTO-GENERATED from shared/skills/create-claw-skill/SKILL.md. Edit the shared source instead. -->
# create-claw-skill

This skill is the claw-native entrypoint for converting a specified text skill or a user idea into a claw skill in the user's current claw-kit-enabled workspace.

Use the specified skill package as the target.
For an existing skill, replace that skill's visible entry with the claw entry and keep the original content as an adjacent fallback document.
For a user idea, create the new skill package directly in its intended location.

## Entry routing

Before entering this template, classify the request shape:

- Direct single-target request: use `claw plan create --template create-claw-skill --title "<source-skill-or-target-skill-name>"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template create-claw-skill` when the current task explicitly asks to use `create-claw-skill`.
- Batch or mixed request: create a normal root claw plan first, split the work into one task per target conversion or per coherent skill-shaped unit, and create template subplans only when execution reaches those tasks.

Generated claw skills should follow the same entry routing standard.
Generated project claw skills should also route directly to their adjacent fallback document when the current workspace has no `.claw` directory.

## Direct entry

Use this section only after the entry routing step classifies the request as a direct single-target conversion.

Do not use direct entry for batch or mixed requests.
For batch or mixed requests, create a normal root claw plan first, put each target conversion into its own task description, and instantiate `create-claw-skill` with `claw subplan create --parent <parent-task-name> --task-id <id> --template create-claw-skill` only when execution reaches that task.

Do not replace execution-time subplans with one broad conversion script unless the user explicitly asks to bypass the claw skill workflow.
Batch root tasks should say which source skill or skill-shaped unit will be converted, where its package lives, and that execution must create the `create-claw-skill` subplan before editing that target.

For a fresh direct single-target request with no recovered task state for the same `create-claw-skill` workflow, the first action is:

`claw plan create --template create-claw-skill --title "<source-skill-or-target-skill-name>"`

Use the source skill name or intended target skill name as the title.

Enter this template workflow first only for a direct single-target conversion.
Perform source analysis, in-place entry conversion, fallback preservation, template drafting, and validation from inside the returned `workflowGuidance`.

This rule still applies when the user is testing this skill itself.
Testing a single conversion with this skill means entering its real template flow first.
Testing batch routing means creating the normal root plan first and deferring template entry to execution-time subplans.

After `claw plan create` returns, follow its `workflowGuidance` as the contract.

The first user-facing reply for a fresh direct invocation should therefore be brief and execution-oriented.
Enter the template workflow first for direct single-target work, then explain progress from inside that workflow.

## First routing step

Task `1` in this template chooses the wrapping route.
Complete it with:

`claw task done --id 1 --choice <choiceId>`

Use:

- `simple` for mostly linear source skills
- `routing` for source skills that already contain meaningful route behavior
- `idea-first` when the source is still mainly a user idea

Complete choice-bearing tasks with `--choice`.
When one route choice is already obvious from the request, choose it promptly and continue.

## Target shape

The job is to translate the source into:

- a claw entry `SKILL.md` in the specified skill package whose main path is `claw plan create --template <template-id>`
- a `.claw/templates/<template-id>.json` template that owns workflow control
- an adjacent non-claw fallback document in the same skill package
- optional compiled knowledge references for distilled source knowledge that is useful during claw execution
- an entry routing section that supports no-`.claw` fallback, direct plan entry, execution-time subplan entry, and root-plan orchestration for batch or mixed requests

## Template placement

The generated entry can only use `claw plan create --template <template-id>` when that template will be resolvable in the workspace where the skill runs.

For project-local conversions, write the template to that project's `.claw/templates/<template-id>.json`.
For distributable plugin or global skill conversions, keep the template source with the converted skill package or plugin build surface and make sure the install/sync process copies it into the user's `.claw/templates` or another supported template registry before the entry advertises the claw route.

Do not leave a converted global skill pointing at a template that exists only in the current development repository.

## Information preservation

Do not treat the conversion as a summary.
The runtime `plan.json` should stay lightweight, but the converted skill package should preserve the source behavior through the claw entry, template, references, and adjacent fallback document.

Before completion, run a content coverage check after template validation.
This check is separate from `claw template validate`: validation checks JSON/template shape, while content coverage checks that important source skill information was not lost.

Map important source information to one of these converted homes:

- `entry`
- `template.tasks`
- `template.guidance`
- `template.rules`
- `template.references`
- `compiled reference`
- `fallback`

Check that the converted package still covers:

- trigger and routing rules
- required tools, commands, helper files, and relative links
- ordered workflow steps
- branch conditions that affect control flow
- safety constraints and hard "do not" rules
- required inputs, outputs, and acceptance criteria
- verification commands or quality gates
- examples, prompts, scripts, and long-form explanations

Put execution-critical information into the template, guidance, or rules.
When important source knowledge is too large for the template but useful during normal claw execution, distill it into a compiled knowledge reference and list it in the template `references`.
Prefer putting compiled knowledge references inside the converted skill package, so the claw skill can reference its own distilled knowledge.
Put fallback-only material into the adjacent fallback document.
Keep anything not otherwise represented in the adjacent fallback document.

Good compiled knowledge references include tool contracts, route decision tables, compact examples, safety cases, helper-file inventories, and verification checklists.
Good filenames include `references/<skill-id>-knowledge.md`, `references/<skill-id>-tool-contract.md`, or `CLAW-KNOWLEDGE.md`.
If a source detail is intentionally omitted, record the reason; otherwise important source information should always have a converted home.

## Keep only these rules in mind

- Keep task ids numeric.
- Keep workflow control in the template.
- Use `guidance.onDone.default` for non-branching guidance changes.
- Use `guidance.onDone.choices.<choiceId>` plus `task.choiceId` for branching.
- Use `mergeMode`.
- Let `plan.configOverride` come only from the template.
- Preserve the original skill as the adjacent fallback document inside the converted skill package.
- Create compiled knowledge references inside the converted skill package when source knowledge is important for claw execution but too verbose for the template.
- Run a content coverage check after template validation and before claiming the conversion complete.
- Validate the generated template with `claw template validate --template <template-id>`.
- Include the standard claw skill entry routing section in generated claw entry skills.
- Route generated project claw skills to the adjacent fallback document when the current workspace has no `.claw` directory.

## Quality bar

- The visible plan should stay lightweight.
- The branching behavior should be recoverable from `templateId`, numeric task id, and optional `task.choiceId`.
- The claw entry should clearly route to `claw plan create --template <template-id>`.
- The fallback document should remain direct, readable, and packaged beside the claw entry.
- Source behavior should be preserved across the claw entry, template, references, and fallback document.
- Any compiled knowledge reference should be listed in the generated template `references` with a clear `why`, preferably pointing back into the converted skill package.
- The generated template should pass `claw template validate --template <template-id>` before the work is claimed complete.
- The final closeout should include a source-to-converted-home content coverage check.
- Any task with `guidance.onDone.choices` must be completed with a recorded `choiceId`; the CLI returns the available choices when this value is needed.
- The skill itself should enter the template workflow immediately.
