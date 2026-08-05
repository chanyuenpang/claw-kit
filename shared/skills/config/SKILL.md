---
name: config
description: Use when a user wants to inspect, explain, or change claw-kit project configuration, including team-owned .claw/project.json and personal .claw/project-override.json preferences.
---

# config

Use this configuration entrypoint to select the correct team config or personal config
ownership surface and apply a bounded change. It is not a planning workflow or
direct mutation command.

Before explaining or editing configuration, read the adjacent shared reference
at `../claw-kit-doc/references/configuration.md`.

## Flow

1. Determine whether the user wants shared team configuration or a personal
   local override.
2. Use `.claw/project.json` for team-owned behavior and
   `.claw/project-override.json` for personal, gitignored behavior.
3. If scope is unclear and materially changes the result, ask: `Should this be
   a shared team config change in .claw/project.json, or a personal local
   override in .claw/project-override.json?`
4. Read the current target, preserve unrelated fields, and edit only the
   requested values.
5. Keep JSON valid with two-space indentation and run `claw check` after a team
   configuration change.

## Guardrails

- Do not commit `.claw/project-override.json`.
- Do not call the personal overlay canonical.
- Do not invent fields or recommend legacy shapes when the shared reference
  already defines the canonical field.
- Keep `knowledgeWriter.externalSkills` visible as the ordered assignment surface.
  An empty list selects the hidden built-in governance contract; a non-empty
  list replaces it with the configured assignments.
- Arrays replace inherited arrays; explicit `null` is an override value.
- Keep `memory.autoUpdate` distinct from top-level `autoUpdate`.
