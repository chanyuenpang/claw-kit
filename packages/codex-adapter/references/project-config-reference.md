# Claw Kit Project Config Reference

Use this note when a Codex thread needs to understand or explain the project-level config surfaces that affect `claw-kit` behavior.

## Config layers

### `.claw/project.json`

- This is the canonical team-owned project declaration.
- `claw init` and protocol repair normalize this file.
- Commit this file to the repository when the project-level harness behavior should be shared.

### `.claw/project-override.json`

- This is a local runtime-only override layer.
- It is gitignored by default.
- Runtime project resolution deep-merges this file over `.claw/project.json`.
- It can override any field from `.claw/project.json`.
- Explicit `null` is a real override value. It does not mean "fall back to the team config."

## Effective config

The effective runtime config is:

`deepMerge(.claw/project.json, .claw/project-override.json)`

Important consequences:

- Local overrides can replace only one nested field without copying the whole object.
- Arrays are treated as replacement values, not append-only patches.
- Explicit `null` can deliberately clear an inherited value such as `externalTruthSkill`.
- Canonical protocol repair does not write local override state back into `.claw/project.json`.

## Canonical project fields

### Identity and retention

- `id`
  - stable project id
- `name`
  - human-readable project name
- `maxTasksToKeep`
  - active task retention limit before archival

### External writers

- `externalTruthSkill`
  - optional override for the truth writer skill
- `externalAdrSkill`
  - optional override for the ADR writer skill

Use `null` when the canonical project should explicitly keep the built-in writer behavior.

### Context and memory

- `contextPaths`
  - optional project paths for shared context shape alignment
- `memory.externalDocPaths`
  - markdown-oriented project recall sources for `claw search`
- `memory.embedding`
  - embedding provider and index behavior for project recall

### GitNexus

- `gitnexus.enabled`
  - enables GitNexus-related completion refresh behavior during closeout

## Workflow config

The canonical project schema now includes:

```json
{
  "workflow": {
    "goalMode": {
      "enabled": true
    },
    "truthDispatch": {
      "mode": "per_task"
    }
  }
}
```

### `workflow.goalMode.enabled`

- default: `true`
- when `true`
  - `workflowGuidance` may return `goalMode` when the plan enters or resumes `process.active`
- when `false`
  - `workflowGuidance` suppresses `goalMode`
  - the rest of the plan lifecycle still works normally

### `workflow.truthDispatch.mode`

Supported values:

- `per_task`
  - default behavior
  - completed tasks may return the mid-task `truth-writer` delegate contract
- `final_only`
  - suppresses mid-task `truth-writer` delegation
  - still allows closeout deposition when all tasks are done

`final_only` is the right setting when the project wants fewer truth handoffs during execution and only wants the durable deposition pass at round closeout.

## Practical examples

### Shared team config

```json
{
  "id": "demo-project",
  "name": "Demo Project",
  "maxTasksToKeep": 99,
  "externalTruthSkill": null,
  "externalAdrSkill": null,
  "contextPaths": [],
  "workflow": {
    "goalMode": {
      "enabled": true
    },
    "truthDispatch": {
      "mode": "per_task"
    }
  },
  "memory": {
    "externalDocPaths": [
      "docs/"
    ],
    "embedding": {
      "provider": "local",
      "model": "Snowflake/snowflake-arctic-embed-m-v2.0",
      "store": {
        "vector": {
          "enabled": true
        }
      }
    }
  },
  "gitnexus": {
    "enabled": false
  }
}
```

### Local personal override

```json
{
  "workflow": {
    "goalMode": {
      "enabled": false
    },
    "truthDispatch": {
      "mode": "final_only"
    }
  }
}
```

### Explicitly clearing an inherited writer override

```json
{
  "externalTruthSkill": null
}
```

## Guidance impact summary

When explaining runtime behavior in a Codex thread:

- `project.json` is the canonical declaration surface
- `project-override.json` is local and runtime-only
- effective behavior comes from the merged config
- `workflow.goalMode.enabled = false` removes `goalMode` from guidance
- `workflow.truthDispatch.mode = final_only` removes mid-task truth delegation from guidance
- closeout truth/ADR deposition still follows the normal root-plan completion contract

## Anti-patterns

- Do not describe `.claw/project-override.json` as a second canonical config file.
- Do not treat explicit `null` as "unset" or "inherit."
- Do not tell users that local override changes will be normalized back into `.claw/project.json`.
- Do not claim `final_only` disables all truth/ADR deposition; it only suppresses the mid-task truth handoff.
