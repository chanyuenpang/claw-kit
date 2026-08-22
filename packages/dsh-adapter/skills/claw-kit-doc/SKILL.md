---
name: claw-kit-doc
description: Use when a user needs claw-kit documentation for updates, project configuration, or Truth and ADR formats.
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

Read only the relevant reference. Keep installed, enabled, and running state
as separate evidence; a new package version is not active until the Host
restarts and the session actually mounts `claw_run`.
