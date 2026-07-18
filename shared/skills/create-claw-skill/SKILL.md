---
name: create-claw-skill
description: Use when a user wants to convert a specified text skill or skill idea into a claw-template-backed skill in the same skill package, with template-owned workflow guidance and an adjacent fallback document.
---
# create-claw-skill

Convert a specified text skill or user idea into a template-backed claw skill. Keep this entry thin; the template owns conversion and validation.

## Route By Task Ownership

- If this skill fully owns the whole current task, use `claw plan create --template create-claw-skill --title "<skill-name>"`.
- If this skill fully owns one stage of a broader plan, use `claw subplan create --parent <parent-task-name> --task-id <id> --template create-claw-skill`. A batch is a common example: the broader plan contains repeated conversion stages, and each stage invokes this skill once as a subplan.
- If this skill only contributes instructions inside a stage that mixes multiple skills, do not create its template plan. Read `FALLBACK.md` and apply the relevant guidance inside the owning workflow.
- If the claw CLI or template is unavailable, read `FALLBACK.md` and run the direct workflow.

After plan or subplan creation, follow the returned `workflowGuidance`.

Fallback: `FALLBACK.md`.
