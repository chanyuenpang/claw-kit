---
name: config
description: Use when a user wants to inspect, explain, or change claw-kit project configuration, including team-owned .claw/project.json and personal .claw/project-override.json preferences.
---
<!-- AUTO-GENERATED from shared/skills/config/SKILL.md. Edit the shared source instead. -->
# config

Use this skill when the user wants to configure claw-kit behavior.

This skill is a configuration entrypoint, not a planning workflow and not a direct file mutation command.
It helps decide which config surface should change, then gives the correct field shape.

## First question

Before recommending or making a config change, establish which scope the user wants:

- Team config:
  - write `.claw/project.json`
  - commit the change when it should be shared by the repository
  - use this for project-wide workflow behavior, shared external skill choices, recall paths, and GitNexus integration
- Personal config:
  - write `.claw/project-override.json`
  - keep it local and gitignored
  - use this for one person's runtime preference, temporary local overrides, or machine-specific choices

If the user has not made the scope clear, ask a concise question before editing:

`Should this be a shared team config change in .claw/project.json, or a personal local override in .claw/project-override.json?`

Do not guess the scope when the consequence matters.

## Config surfaces

### Team config

`.claw/project.json` is the canonical team-owned declaration.
It is normalized by `claw init` and protocol repair.

Use it when the team should share the behavior:

- `planning`
- `autoUpdate`
- `externalPlanningSkill`
- `externalTruthSkill`
- `externalAdrSkill`
- `contextPaths`
- `memory.externalDocPaths`
- `memory.embedding`
- `goalMode`
- `truthDispatch`
- `gitnexus`

### Personal config

`.claw/project-override.json` is a local runtime-only overlay.
It deep-merges over `.claw/project.json`.
It is gitignored by default and must not be treated as a second canonical config file.

Use it when the change should affect only the current checkout or user.

Example personal override:

```json
{
  "goalMode": false,
  "truthDispatch": "final_only",
  "externalTruthSkill": null
}
```

Example personal planning override:

```json
{
  "planning": true,
  "externalPlanningSkill": "my-planning-skill"
}
```

Example personal GitNexus override:

```json
{
  "gitnexus": true
}
```

Nested objects still use normal JSON merge behavior.
Arrays replace inherited arrays rather than appending to them.
Explicit `null` is a real override value, not inheritance.

## Field shape

Use the flat canonical fields for simple project-level toggles:

```json
{
  "planning": true,
  "autoUpdate": true,
  "externalPlanningSkill": null,
  "goalMode": true,
  "truthDispatch": "per_task",
  "gitnexus": false
}
```

Keep nested shape only where the field actually has substructure:

```json
{
  "memory": {
    "externalDocPaths": ["docs/"],
    "embedding": {
      "provider": "local",
      "model": "Snowflake/snowflake-arctic-embed-m-v2.0"
    }
  }
}
```

Legacy nested inputs such as `workflow.goalMode.enabled`, `workflow.truthDispatch.mode`, and `gitnexus.enabled` may be repaired by claw-kit, but they are not the recommended format.

## Safe editing flow

1. Determine team vs personal scope.
2. Read the current target file if it exists.
3. Preserve unrelated fields.
4. Apply only the requested config change.
5. Keep JSON valid and formatted with two-space indentation.
6. Run `claw check` or `claw context` when changing `.claw/project.json`.
7. Do not run protocol repair expecting it to write `.claw/project-override.json`; override files are local runtime input only.

## Guardrails

- Do not put personal preferences into `.claw/project.json` unless the user explicitly wants a shared team change.
- Do not commit `.claw/project-override.json`.
- Do not describe `.claw/project-override.json` as canonical.
- Do not recommend legacy nested toggle shapes as the normal format.
- Do not use `memory.enabled`; it is not a canonical field.
- Do not invent new config fields when an existing canonical field covers the need.
