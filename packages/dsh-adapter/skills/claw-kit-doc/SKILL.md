---
name: claw-kit-doc
description: Use when a user needs claw-kit documentation for updates, project configuration, plan or task item operations, or Truth and ADR formats.
---

# claw-kit-doc

This is the DSH adapter's documentation entry. It selects documentation for
the current request and does not perform updates or configuration mutations.

- For updating claw-kit, read `references/update.md` for the CLI/version
  contract, then apply the DSH surface steps: re-export and reinstall the
  adapter (`npm run export:dsh-plugin` + `npm run install:dsh-plugin`, or
  `dsh plugin --profile <name> add @veewo/dsh-claw-kit` from the registry),
  and restart the Host so the bundle layer reloads. Verify the running
  `claw --version` matches the project's expected version — the CLI and the
  adapter are one validation unit.
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

Read only the relevant reference. Keep installed, enabled, and running state
as separate evidence; a new package version is not active until the Host
restarts and the session actually mounts `claw_run`.
