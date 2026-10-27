---
name: claw-kit-doc
description: Use when a user needs claw-kit documentation for updates, project configuration, plan or task item operations, or Truth and ADR formats.
---

# claw-kit-doc

Select only the documentation relevant to the request. This skill explains contracts; it does not authorize updates, configuration changes, or workflow mutations.

- Project configuration: read `references/configuration.md`.
- Truth/ADR structure: read `references/knowledge-format.md`.
- Updates: read only the current host section of `references/update.md`. The current host-provided `[claw host]` marker and verified active adapter determine the host, not the model name or a workspace-local skill path; unknown or conflicting identity must not silently fall back to another host. Codex, DSH and OpenCode use their own `update` packages only with user authorization; Cindy uses its plugin UI and intentionally has no update skill; OpenClaw uses its plugin lifecycle; standard hostless updates only the CLI. Do not substitute another host's installer.

## Plan and task item operations

- `claw plan edit` owns plan-level fields and lifecycle status; it does not add, replace, edit, or delete tasks.
- `claw plan remove` removes exact values from supported plan collections, not task items.
- `claw task add`, `claw task edit`, `claw task done`, and `claw task remove` own task-item mutations. CLI deletion is `task remove --id <number>` with repeatable ids in argument order.
- These are semantic CLI contracts, not a guarantee that every adapter exposes every operation. Use the active host's required route: DSH `claw_run`, Codex driver, Cindy selected Ghost/bridge route, OpenCode adapter, or standard hostless CLI. If the installed adapter lacks an operation (for example task removal), report that capability gap; never bypass it through shell, direct plan JSON, generic patches, or a replacement tasks array.
- A progress API such as `update_plan` is only a projection; its lack of a separate delete operation does not prove the canonical model cannot delete task items. Never manually duplicate adapter-owned Goal/progress effects.

Keep published source, installed package, enabled identity, and running/loaded state separate. A refresh or new package on disk does not prove activation. Restart a host only with the necessary user authorization and verify the new session's actual tool/skill surface before claiming it loaded.
