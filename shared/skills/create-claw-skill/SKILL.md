---
name: create-claw-skill
description: Use when a user wants to convert a specified text skill or skill idea into a claw-template-backed skill in the same skill package, with template-owned workflow guidance and an adjacent fallback document.
---
# create-claw-skill

Convert a specified text skill or user idea into a template-backed claw skill. Keep this entry thin; the template owns conversion and validation.

## Route By Task Ownership

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- If this skill fully owns the whole current task, use `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "<skill-name>"`.
- If this skill fully owns one stage of a broader plan, use `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`. On hosts with Goal Mode, consume the returned goal handoff so the active parent goal completes before the child plan creates its own goal; never overwrite the parent goal. A batch is a common example: the broader plan contains repeated conversion stages, and each stage invokes this skill once as a subplan.
- If this skill only contributes instructions inside a stage that mixes multiple skills, do not create its template plan. Read `FALLBACK.md` and apply the relevant guidance inside the owning workflow.
- If the claw CLI or template is unavailable, read `FALLBACK.md` and run the direct workflow.

After plan or subplan creation, follow the returned `workflowGuidance`.

## Upgrade Existing Template

When claw reports `Template out of date`, use this skill to upgrade the selected skill package:

1. Inspect `SKILL.md`, `TEMPLATE.json`, fallback content, and references against the current contract.
2. Optimize outdated workflow structure or guidance; do not only bump `version`.
3. Set `TEMPLATE.json.version` to the current CLI version after the review.
4. Run `claw template validate --file "<skill-dir>/TEMPLATE.json"`.

See `references/template-upgrade.md` for the upgrade checklist.

## Template Lifecycle Choice

Treat `claw plan start` as optional global syntax sugar. Add `guidance.onPlanStart` to a task only when that task's completed discussion should deliberately bundle plan refinement with its declared internal transition, such as completing the task and entering `process.active`. Otherwise omit it and express delivery with ordinary task guidance and plan/task mutations. An executable template should normally start in `process.active` and need no `onPlanStart`.

Fallback: `FALLBACK.md`.
Template upgrade: `references/template-upgrade.md`.
Template authoring contract: `references/template-authoring.md`.
Content coverage: `CONTENT-COVERAGE.md`.
