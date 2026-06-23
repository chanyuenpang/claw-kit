# `project.json` Reference

This guide explains the project-level config surfaces that shape `claw-kit` behavior inside a repository.

At a product level, `claw-kit` can be used without GitNexus. The `gitnexus` field below is an optional integration switch, not a required dependency.

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
- should use the same flat canonical field names as `.claw/project.json`

This split is one of the reasons `claw-kit` works well for team collaboration: the repo can keep a shared workflow contract while individual users keep personal runtime preferences out of canonical project config.

The effective runtime config is:

`deepMerge(.claw/project.json, .claw/project-override.json)`

Important consequences:

- local overrides can replace a single field without copying the full object
- arrays are replacement values, not append-only patches
- explicit `null` can intentionally clear inherited values such as `externalTruthSkill`
- protocol repair does not write local override state back into canonical `project.json`
- legacy nested inputs may be tolerated by repair in `.claw/project.json`, but new override examples should use the flat canonical field shape

Together, the canonical config plus local override model gives longer-running project work a stable shared surface without forcing every personal preference into the team-owned file.

## Canonical fields

### Identity and retention

- `id`
  - stable project id
- `name`
  - human-readable project name
- `maxTasksToKeep`
  - active task retention limit before archival
  - default: `99`

### Planning

- `planning`
  - default: `true`
  - when `true`, `claw plan create` seeds a planning-first root plan in `process.discussing`
  - when `false`, `claw plan create` seeds the smallest executable root plan in `process.active`
- `externalPlanningSkill`
  - optional planning skill name for task 1 in planning-enabled seed plans
  - use `null` to keep the host-default built-in planning skill surface

### External writers

- `externalTruthSkill`
  - optional override for the truth writer skill
- `externalAdrSkill`
  - optional override for the ADR writer skill

Use `null` when the project should explicitly keep the built-in writer behavior.

### Context and memory

- `contextPaths`
  - optional project paths kept for shared context shape alignment
- `memory.externalDocPaths`
  - markdown-oriented recall sources for `claw search`
- `memory.embedding`
  - embedding provider and index behavior for project recall
  - the minimal local default only needs `provider` and `model`
  - `store.vector` only needs to be written when you want to disable vectors or set `extensionPath`

### GitNexus

- `gitnexus`
  - optional integration switch for GitNexus-related closeout and completion-refresh behavior
  - default: `false`
  - default usage of `claw-kit` does not require GitNexus to be enabled

### Workflow controls

- `goalMode`
  - default: `true`
  - when `false`, returned `workflowGuidance` suppresses `goalMode`
- `truthDispatch`
  - `per_task`: default behavior, allows mid-task truth deposition guidance
  - `final_only`: suppresses mid-task truth deposition while still allowing closeout deposition

Legacy nested inputs such as `gitnexus.enabled`, `workflow.goalMode.enabled`, and `workflow.truthDispatch.mode` are tolerated by protocol repair, but the repaired canonical file is flattened back to the fields above.

## Practical examples

### Minimal shared team config

```json
{
  "id": "demo-project",
  "name": "Demo Project",
  "maxTasksToKeep": 99,
  "planning": true,
  "externalPlanningSkill": null,
  "externalTruthSkill": null,
  "externalAdrSkill": null,
  "contextPaths": [],
  "memory": {
    "externalDocPaths": [],
    "embedding": {
      "provider": "local",
      "model": "Snowflake/snowflake-arctic-embed-m-v2.0"
    }
  },
  "goalMode": true,
  "truthDispatch": "per_task",
  "gitnexus": false
}
```

### Planning-enabled root plans

When `planning = true`, the normal root entry flow is:

`claw plan create` -> `process.discussing` -> task 1 planning -> task 2 activate -> execution

The default template is `default`. The CLI can also select it explicitly:

```powershell
claw plan create "My task" --template default --goal "Define the first task"
```

### Planning-disabled root plans

```json
{
  "planning": false,
  "externalPlanningSkill": null
}
```

When `planning = false`, the normal root entry flow is:

`claw plan create` -> `process.active`

The seed plan contains one minimal executable task whose title follows the goal/title.

### Planning-enabled root plans with an external planning skill

```json
{
  "planning": true,
  "externalPlanningSkill": "team-planner"
}
```

With this config, planning-enabled seed plans still start in `process.discussing`, but task 1 tells the agent to use `team-planner` to refine the request and append executable tasks.

### Enable shared docs for recall

```json
{
  "memory": {
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

### Personal override file

`.claw/project-override.json`:

```json
{
  "goalMode": false,
  "truthDispatch": "final_only"
}
```

### Personal planning override

`.claw/project-override.json`:

```json
{
  "planning": true,
  "externalPlanningSkill": "my-planning-skill"
}
```

### Personal GitNexus override

`.claw/project-override.json`:

```json
{
  "gitnexus": true
}
```

### Explicit writer override

`.claw/project.json` for a shared team override, or `.claw/project-override.json` for a personal override:

```json
{
  "externalTruthSkill": "external-truth-writer",
  "externalAdrSkill": "external-adr-writer"
}
```

### Explicitly clear an inherited writer override

`.claw/project-override.json`:

```json
{
  "externalTruthSkill": null
}
```

### Remote embeddings

```json
{
  "memory": {
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

### Disable GitNexus integration

```json
{
  "gitnexus": false
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
- `planning = true` makes `plan create` start in `process.discussing` with planning and activation bridge tasks
- `planning = false` makes `plan create` start directly in `process.active` with a minimal executable plan
- `externalPlanningSkill` only selects the planning skill name used by task 1; it does not make the skill claw-aware
- `gitnexus = true` opts a project into GitNexus-related integration behavior, but `claw-kit` still works without it
- default local embedding configs do not need `store.vector.enabled = true` written explicitly
- `goalMode = false` removes `goalMode` from workflow guidance
- `truthDispatch = final_only` removes mid-task truth deposition guidance but not closeout deposition

That same project-level config and plan surface is part of why `claw-kit` works well for longer-running tasks: the workflow, truth, and ADR state live in durable project surfaces instead of only in transient chat history.

## Anti-patterns

- Do not describe `.claw/project-override.json` as a second canonical config file.
- Do not treat explicit `null` as "unset" or "inherit."
- Do not claim local override changes will be normalized back into `.claw/project.json`.
- Do not claim `final_only` disables all truth or ADR deposition.
