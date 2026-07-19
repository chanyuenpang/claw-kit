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
- explicit `null` can intentionally clear inherited values such as `knowledgeWriter.externalSkill`
- protocol repair does not write local override state back into canonical `project.json`
- legacy nested inputs may be tolerated by repair in `.claw/project.json`, but new override examples should use the flat canonical field shape

Together, the canonical config plus local override model gives longer-running project work a stable shared surface without forcing every personal preference into the team-owned file.

## Canonical fields

### Identity and retention

- `version`
  - expected claw-kit CLI protocol version for this project
  - when lower than the current CLI, `claw context` aligns the file upward
  - when higher than the current CLI, `claw context` reports CLI lagging information in `startupRecovery.versionSync`
- `autoUpdate`
  - default: `true`
  - when `true` and a newer published claw-kit exists, startup recovery tells the agent that the first action must be `claw-kit:update`
  - when `false`, startup recovery only reports the version mismatch and must not instruct the agent to perform the update
- `id`
  - stable project id
- `name`
  - human-readable project name
- `maxTasksToKeep`
  - archived task retention limit before oldest-archive pruning
  - default: `9`

### Planning

- `planning`
  - default: `true`
  - when `true`, `claw plan create` seeds a planning-first root plan in `process.discussing`
  - when `false`, `claw plan create` seeds the smallest executable root plan in `process.active`
- `externalPlanningSkill`
  - optional planning skill name for task 1 in planning-enabled seed plans
  - use `null` to fall back to `claw-kit:planning`

### Knowledge writer

- `knowledgeWriter.externalSkill`
  - optional skill override used by the combined knowledge-writer pass
  - use `null` for the built-in consistency-aware `claw-kit:knowledge-writer`

### Context and memory

- `contextPaths`
  - optional project paths kept for shared context shape alignment
- `memory.enabled`
  - master switch for project memory, task memory, embedding refresh, and `claw search`
  - default: `true`
- `memory.externalDocPaths`
  - markdown-oriented recall sources for `claw search`
- `memory.embedding`
  - embedding provider and index behavior for project recall
  - the minimal local default only needs `provider` and `model`

### GitNexus

- `gitnexus`
  - optional integration switch for GitNexus-related closeout and completion-refresh behavior
  - default: `true`
  - default usage of `claw-kit` does not require GitNexus to be enabled

### Workflow controls

- `goalMode`
  - default: `true`
  - when `false`, returned `workflowGuidance` suppresses `goalMode`
- `knowledgeWriter`
  - `externalSkill`: optional skill override for the combined finalizer prompt; `null` uses `claw-kit:knowledge-writer`
  - `model`: optional Codex model override for the asynchronous auto-doc writer; `null` uses the SDK default
  - `reasoningEffort`: writer reasoning depth; one of `minimal`, `low`, `medium`, `high`, or `xhigh`

### Template variables

- `var`
  - optional object for project-defined template guidance variables
  - reference values with the `var.*` namespace, for example `{{var.releaseChannel}}`
  - nested string, number, and boolean leaves can be rendered by template guidance
  - use this namespace instead of adding unknown top-level fields; protocol repair removes unknown or retired top-level configuration keys

The removed `truthDispatch` timing switch is discarded during protocol repair. Auto-doc captures every eligible turn report and judges durable truth and ADR content only when a plan closes.

Older nested inputs should be rewritten into the flat fields above during protocol repair; new config should use only the canonical flat shape.

## Practical examples

### Minimal shared team config

```json
{
  "version": "0.1.54",
  "id": "demo-project",
  "name": "Demo Project",
  "maxTasksToKeep": 9,
  "planning": true,
  "autoUpdate": true,
  "externalPlanningSkill": null,
  "defaultPlanTemplate": null,
  "contextPaths": [],
  "memory": {
    "enabled": true,
    "externalDocPaths": [],
    "embedding": {
      "provider": "local",
      "model": "Snowflake/snowflake-arctic-embed-m-v2.0"
    }
  },
  "goalMode": true,
  "knowledgeWriter": {
    "externalSkill": null,
    "model": null,
    "reasoningEffort": "medium"
  },
  "gitnexus": false
}
```

### Planning-enabled root plans

When `planning = true`, the normal root entry flow is:

`claw plan create` -> `process.discussing` -> task 1 planning -> execution or closeout

The built-in fallback template is `default`. The CLI uses explicit `--template` first, otherwise the merged `defaultPlanTemplate` from `.claw/project.json` plus `.claw/project-override.json`, and only then falls back to `default`.

The CLI can still select the fallback template explicitly:

```powershell
claw plan create "My task" --template default --goal "Define the first task"
```

### Project-owned template directory

Project templates live directly under `.claw/templates` and can use these formats:

- `.claw/templates/<name>.json`
- `.claw/templates/<name>.js`
- `.claw/templates/<name>.mjs`
- `.claw/templates/<name>.cjs`

JavaScript-backed templates should export the same plan-like template object shape as the built-in template.

### Shared default project template

`.claw/project.json`:

```json
{
  "defaultPlanTemplate": "team-default"
}
```

`.claw/templates/team-default.js`:

```js
export default {
  id: "team-default",
  status: "process.discussing",
  goal: {
    text: ""
  },
  requirements: {
    summary: "",
    openQuestions: [],
    acceptanceCriteria: []
  },
  tasks: [
    {
      id: 1,
      title: "Use the team planning flow",
      detail: "Use {{planningSkill}} until the discussion is complete and the smallest outcome-oriented task list is clear.",
      status: "pending"
    }
  ],
  references: [],
  rules: [],
  keyDecisions: [],
  retrospective: {
    summary: ""
  }
}
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

The runtime plan contains one minimal executable task whose title follows the goal/title.

### Planning-enabled root plans with an external planning skill

```json
{
  "planning": true,
  "externalPlanningSkill": "team-planner"
}
```

With this config, planning-enabled default plans still start in `process.discussing`, but task 1 tells the agent to use `team-planner` to refine the request and append executable tasks.

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

### Disable project memory and claw search

```json
{
  "memory": {
    "enabled": false
  }
}
```

### Personal override file

`.claw/project-override.json`:

```json
{
  "goalMode": false,
  "knowledgeWriter": {
    "externalSkill": null,
    "model": "gpt-5.6-sol",
    "reasoningEffort": "high"
  }
}
```

### Personal planning override

`.claw/project-override.json`:

```json
{
  "planning": true,
  "externalPlanningSkill": "my-planning-skill",
  "defaultPlanTemplate": "my-personal-template"
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
  "knowledgeWriter": {
    "externalSkill": "external-knowledge-writer"
  }
}
```

### Explicitly clear an inherited writer override

`.claw/project-override.json`:

```json
{
  "knowledgeWriter": {
    "externalSkill": null
  }
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
- `memory.enabled = false` disables project memory, task memory, embedding refresh, and `claw search`
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
- `planning = true` makes `plan create` start in `process.discussing` with one planning task; it either starts the resulting execution tasks or closes when planning itself resolves the request
- `planning = false` makes `plan create` start directly in `process.active` with a minimal executable plan
- `autoUpdate = true` lets startup recovery route the agent to `claw-kit:update` first when a newer published claw-kit version is available
- `autoUpdate = false` keeps version drift informational only
- `externalPlanningSkill` only selects the planning skill name used by task 1; it does not make the skill claw-aware
- `gitnexus = true` opts a project into GitNexus-related integration behavior, but `claw-kit` still works without it
- `goalMode = false` removes `goalMode` from workflow guidance
- `knowledgeWriter` selects the external skill, Codex model, and reasoning depth used by asynchronous auto-doc closeout

That same project-level config and plan surface is part of why `claw-kit` works well for longer-running tasks: the workflow, truth, and ADR state live in durable project surfaces instead of only in transient chat history.

## Anti-patterns

- Do not describe `.claw/project-override.json` as a second canonical config file.
- Do not treat explicit `null` as "unset" or "inherit."
- Do not claim local override changes will be normalized back into `.claw/project.json`.
- Do not reintroduce per-task versus final-only dispatch timing; report capture and closeout judgment are separate stages.
