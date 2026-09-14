---
name: claw-kit-doc
description: Use when a user needs claw-kit documentation for project configuration or Truth and ADR formats on the standard hostless flow.
---

# claw-kit-doc

This is the standard hostless adapter's documentation entry. It selects
documentation for the current request and does not perform updates or
configuration mutations.

- For updating the claw CLI, use the platform's native package manager
  (`npm install -g @veewo/claw@latest`); there is no host plugin surface to
  align in the standard flow. Ask the user before changing their environment.
- For project configuration, read `references/configuration.md`.
- For Truth or ADR structure, read `references/knowledge-format.md`.

Read only the relevant reference. Keep installed and loaded runtime state as
separate evidence.
