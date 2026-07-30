---
name: create-claw-skill
description: Use when a user wants to convert a specified text skill or skill idea into a claw-template-backed skill in the same skill package, with template-owned workflow guidance and an adjacent fallback document.
---
<!-- AUTO-GENERATED from shared/skills/create-claw-skill/SKILL.md. Edit the shared source instead. -->
# create-claw-skill

This skill uses Cindy Ghost `list_tools` and `call_tool` for every claw plan, subplan, validation, and task mutation. Never translate its operation into a shell command in the Agent prompt.

Convert a specified text skill or user idea into a template-backed claw skill. Keep this entry thin; the template owns conversion and validation.

## Route By Task Ownership

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- If the user's requirements would require broad changes to this skill's template workflow, do not create its template plan or subplan. Read `FALLBACK.md` and apply the direct workflow instead.
- If this skill fully owns the whole current task, call Ghost operation `plan.create` with the template file and title.
- If this skill fully owns one stage of a broader plan, call Ghost operation `subplan.create` with the parent and task id and consume its returned guidance.
- If this skill only contributes instructions inside a stage that mixes multiple skills, do not create its template plan. Read `FALLBACK.md` and apply the relevant guidance inside the owning workflow.
- If the Ghost tool or template is unavailable, read `FALLBACK.md` and run the direct workflow without pretending the plan mutation succeeded.

After plan or subplan creation, follow the returned `workflowGuidance`.

## Upgrade Existing Template

When claw reports `Template out of date`, use this skill to upgrade the selected skill package:

1. Inspect `SKILL.md`, `TEMPLATE.json`, fallback content, and references against the current contract.
2. Optimize outdated workflow structure or guidance; do not only bump `version`.
3. Set `TEMPLATE.json.version` to the current CLI version after the review.
4. Call the available template validation operation through Cindy Ghost tools.

See `references/template-upgrade.md` for the upgrade checklist.

## Template Lifecycle Choice

Treat `claw plan start` as optional global syntax sugar. Add `guidance.onPlanStart` to a task only when that task's completed discussion should deliberately bundle plan refinement with its declared internal transition, such as completing the task and entering `process.active`. Otherwise omit it and express delivery with ordinary task guidance and plan/task mutations. An executable template should normally start in `process.active` and need no `onPlanStart`.

Fallback: `FALLBACK.md`.
Template upgrade: `references/template-upgrade.md`.
Template authoring contract: `references/template-authoring.md`.
Content coverage: `CONTENT-COVERAGE.md`.


