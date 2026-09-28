---
name: claw-kit-doc
description: Use when a user needs claw-kit documentation for updates, project configuration, plan or task item operations, or Truth and ADR formats.
---

# claw-kit-doc

This is the OpenCode adapter's documentation entry. It selects documentation
for the current request and does not perform updates or configuration
mutations.

- For updating claw-kit, read the **OpenCode** section in
  `references/update.md`, then use the adapter-owned update skill only when the
  user authorizes the change.
- For project configuration, read `references/configuration.md`.
- For Truth or ADR structure, read `references/knowledge-format.md`.

## Plan and task item operations

When the question concerns adding, editing, completing, or deleting items in
an active plan, use this contract before drawing conclusions from a command or
host-tool name:

- `claw plan edit` owns plan-level fields and lifecycle status only. It does
  not add, replace, edit, or delete `tasks`.
- `claw plan remove` removes exact values from supported plan-level
  collections; it does not remove task items.
- `claw task add`, `claw task edit`, `claw task done`, and
  `claw task remove` own task-item mutations. To delete task items, use the
  active host's required mutation route with argv equivalent to
  `task remove --id <number>`; repeat `--id` to remove several items in
  argument order.
- A native progress API such as `update_plan` may accept a complete rendered
  plan and expose no separate `delete_task` operation. That is a projection
  API limitation, not evidence that claw cannot delete task items.
- Do not attempt task deletion through a generic JSON patch, a replacement
  `tasks` array, or a plan-field command. Use task ids and the task mutation
  route, then rely on the returned canonical plan/progress projection.

Read only the relevant reference. Keep release, installed, enabled, and loaded
runtime state as separate evidence.
