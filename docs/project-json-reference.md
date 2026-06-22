# `project.json` Reference

This guide explains the project-level config surfaces that shape `claw-kit` behavior inside a repository.

At a product level, `claw-kit` can be used without GitNexus. The `gitnexus` section below is an optional integration surface, not a required dependency.

## Config layers

### `.claw/project.json`

- canonical team-owned project declaration
- normalized by `claw init` and protocol repair
- should be committed when the workflow behavior is meant to be shared by the repo

### `.claw/project-override.json`

- local runtime-only override layer
- gitignored by default
- deep-merges over `.claw/project.json`
- can override any field from `.claw/project.json`
- explicit `null` is a real override value, not "fall back to team config"

This split is one of the reasons `claw-kit` works well for team collaboration: the repo can keep a shared workflow contract while individual users keep personal runtime preferences out of canonical project config.

The effective runtime config is:

`deepMerge(.claw/project.json, .claw/project-override.json)`

Important consequences:

- local overrides can replace a single nested field without copying the full object
- arrays are replacement values, not append-only patches
- explicit `null` can intentionally clear inherited values such as `externalTruthSkill`
- protocol repair does not write local override state back into canonical `project.json`

Together, the canonical config plus local override model gives longer-running project work a stable shared surface without forcing every personal preference into the team-owned file.

## Canonical fields

### Identity and retention

- `id`
  - stable project id
- `name`
  - human-readable project name
- `maxTasksToKeep`
  - active task retention limit before archival
  - default: `9`

### External writers

- `externalTruthSkill`
  - optional override for the truth writer skill
- `externalAdrSkill`
  - optional override for the ADR writer skill

Use `null` when the project should explicitly keep the built-in writer behavior.

### Context and memory

- `contextPaths`
  - optional project paths kept for shared context shape alignment
- `memory.enabled`
  - master switch for project memory features
  - default: `true`
  - when `false`, project search and embedding/index refresh are disabled
- `memory.externalDocPaths`
  - markdown-oriented recall sources for `claw search`
- `memory.embedding`
  - embedding provider and index behavior for project recall
  - the minimal local default only needs `provider` and `model`
  - `store.vector` only needs to be written when you want to disable vectors or set `extensionPath`

### GitNexus

- `gitnexus.enabled`
  - optional integration switch for GitNexus-related closeout and completion-refresh behavior
  - default usage of `claw-kit` does not require GitNexus to be enabled

### Workflow

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

- `workflow.goalMode.enabled`
  - default: `true`
  - when `false`, returned `workflowGuidance` suppresses `goalMode`
- `workflow.truthDispatch.mode`
  - `per_task`: default behavior, allows mid-task truth deposition guidance
  - `final_only`: suppresses mid-task truth deposition while still allowing closeout deposition

## Practical examples

### Minimal shared team config

```json
{
  "id": "demo-project",
  "name": "Demo Project",
  "maxTasksToKeep": 9,
  "externalTruthSkill": null,
  "externalAdrSkill": null,
  "contextPaths": [],
  "memory": {
    "enabled": true,
    "externalDocPaths": [],
    "embedding": {
      "provider": "local",
      "model": "Snowflake/snowflake-arctic-embed-m-v2.0"
    }
  },
  "gitnexus": {
    "enabled": false
  },
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

### Enable shared docs for recall

```json
{
  "memory": {
    "enabled": true,
    "externalDocPaths": [
      "docs/",
      "architecture/"
    ],
    "embedding": {
      "provider": "local",
      "model": "Snowflake/snowflake-arctic-embed-m-v2.0"
    }
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

### Explicit writer override

```json
{
  "externalTruthSkill": "external-truth-writer",
  "externalAdrSkill": "external-adr-writer"
}
```

### Explicitly clear an inherited writer override

```json
{
  "externalTruthSkill": null
}
```

### Remote embeddings

```json
{
  "memory": {
    "enabled": true,
    "externalDocPaths": [],
    "embedding": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "remote": {
        "apiKeyEnvVar": "OPENAI_API_KEY"
      }
    }
  }
}
```

### Disable project memory behavior

```json
{
  "memory": {
    "enabled": false,
    "externalDocPaths": [],
    "embedding": {
      "provider": "local",
      "model": "Snowflake/snowflake-arctic-embed-m-v2.0"
    }
  }
}
```

## Notes on embeddings and refresh

- `claw search` is recall over project docs, not code search
- `claw search index --refresh` expects `memory.embedding` to be configured
- local embedding defaults to `Snowflake/snowflake-arctic-embed-m-v2.0`
- if `memory.embedding.local.modelCacheDir` is not set, claw prefers the platform-global cache and falls back to `.claw/models` only when needed
- `memory.embedding.local.device` can be used to force `cpu`, `dml`, `cuda`, or `wasm`
- explicit `memory.embedding.outputDimensionality` overrides model-derived defaults

## Guidance summary

When explaining project behavior:

- `.claw/project.json` is the canonical declaration surface
- `.claw/project-override.json` is local and runtime-only
- the canonical-plus-personal split is part of the collaboration model, not just a schema detail
- `memory.enabled = false` disables project memory search plus embedding/index refresh
- `gitnexus.enabled = true` opts a project into GitNexus-related integration behavior, but `claw-kit` still works without it
- default local embedding configs do not need `store.vector.enabled = true` written explicitly
- `workflow.goalMode.enabled = false` removes `goalMode` from workflow guidance
- `workflow.truthDispatch.mode = final_only` removes mid-task truth deposition guidance but not closeout deposition

That same project-level config and plan surface is part of why `claw-kit` works well for longer-running tasks: the workflow, truth, and ADR state live in durable project surfaces instead of only in transient chat history.

## Anti-patterns

- Do not describe `.claw/project-override.json` as a second canonical config file.
- Do not treat explicit `null` as "unset" or "inherit."
- Do not claim local override changes will be normalized back into `.claw/project.json`.
- Do not claim `final_only` disables all truth or ADR deposition.
