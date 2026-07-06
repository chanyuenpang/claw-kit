---
name: create-claw-skill
description: Use when a user wants to convert a specified text skill or skill idea into a claw-template-backed skill in the same skill package, with template-owned workflow guidance and an adjacent fallback document.
---
<!-- AUTO-GENERATED from shared/skills/create-claw-skill/SKILL.md. Edit the shared source instead. -->
# create-claw-skill

This skill converts a specified text skill or user idea into a claw-template-backed skill.

Keep this entry thin. The claw template owns the workflow, tool usage, validation, content coverage, and generated-skill routing rules.

## Entry Routing

Before entering the template, classify the request shape:

- Direct single-target request: use `claw plan create --template create-claw-skill --title "<source-skill-or-target-skill-name>"`.
- Active parent-plan task: use `claw subplan create --parent <parent-task-name> --task-id <id> --template create-claw-skill` when execution reaches a task that explicitly asks to use `create-claw-skill`.
- Batch or mixed request: create a normal root claw plan first, split the work into one task per target conversion or coherent skill-shaped unit, and create the `create-claw-skill` subplan only when execution reaches each target task.

For batch or mixed root plans, target task titles should use this shape:

`Run a create-claw-skill subplan, convert <skill-name>`

Target task details should make the subplan requirement part of the task goal:

`Goal: run a create-claw-skill subplan to convert <source-skill-path> into a claw skill. This subtask is satisfied by creating and completing that target subplan, not by running the claw skill workflow in the root plan. When executing this task, first run claw subplan create --parent <root-task-name> --task-id <id> --template create-claw-skill, then follow the returned workflowGuidance inside that subplan until the subplan completes.`

After `claw plan create` or `claw subplan create` returns, follow the returned `workflowGuidance` as the execution contract.
