# Template Authoring Contract

Use a plan-like `TEMPLATE.json` beside `SKILL.md`.

## Required shape

- Top-level `id`, `version`, `status`, and numeric-id `tasks` are required.
- Set `version` to the current claw CLI version only after inspection and validation.
- Executable workflows normally start in `process.active`.
- Keep structured execution in template tasks, guidance, rules, and references; keep direct plan-independent behavior in the adjacent fallback.

## Rule ownership

- Put a constraint in the owning sub-task's `detail` when one sub-task owns it.
- Use top-level `rules` only for constraints that span tasks or govern the whole plan.
- Do not duplicate a constraint in both places.

## Routing and lifecycle

- Whole task: create a plan with the adjacent template file.
- Independently owned stage, including one item in a batch: create a subplan and consume the Goal handoff before creating a child Goal.
- Mixed stage: use the fallback inside the owning workflow instead of creating this template plan.
- Add `guidance.onPlanStart` only when a discussion task deliberately owns the transition into execution.

## Choices

Use `guidance.onDone.choices` only when the selection changes the immediate downstream route. Expose valid ids once in `completionChoices`, recommend one `claw task done --id <id> --choice <choice>` command template, and do not repeat ids in `nextsteps`.

## Validation

Run `claw template validate --file "<skill-dir>/TEMPLATE.json"`. Confirm no task-specific constraint remains in top-level `rules`. Then check content coverage so important source behavior remains represented in `SKILL.md`, `TEMPLATE.json`, the fallback, or focused references.
