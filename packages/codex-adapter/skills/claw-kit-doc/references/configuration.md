# claw-kit project configuration

## Configuration ownership

- Team configuration lives in `.claw/project.json`. Commit it when the project
  should share the behavior.
- Personal configuration lives in `.claw/project-override.json`. It is a local,
  gitignored overlay and must not be treated as a second canonical file.

Ask which scope the user wants before editing when the consequence matters.
The personal file deep-merges over the team file: nested objects merge, arrays
replace inherited arrays, and explicit `null` is a real override value.

## Canonical fields

Simple project toggles use flat fields:

```json
{
  "planning": true,
  "autoUpdate": true,
  "externalPlanningSkill": null,
  "goalMode": true,
  "gitnexus": false
}
```

Structured settings remain nested:

```json
{
  "knowledgeWriter": {
    "executionPolicy": "background",
    "externalSkills": [],
    "model": null,
    "reasoningEffort": "medium",
    "datedSectionsToKeep": 6
  },
  "knowledgeWriterByHost": {
    "codex": { "executionPolicy": "subagent" }
  },
  "memory": {
    "autoUpdate": true,
    "externalDocPaths": ["docs/"],
    "embedding": {
      "provider": "local",
      "model": "jinaai/jina-embeddings-v2-base-zh",
      "outputDimensionality": 768
    }
  }
}
```

Supported project surfaces include:

- `version`, `id`, `name`, and `maxTasksToKeep`;
- `planning`, `externalPlanningSkill`, `goalMode`, and `autoUpdate`;
- `defaultPlanTemplate` and project template variables under `var`;
- `contextPaths` and `gitnexus`;
- `memory.enabled`, `memory.autoUpdate`, `memory.externalDocPaths`, and
  `memory.embedding`;
- `knowledgeWriter.externalSkills`, `executionPolicy`, `model`,
  `reasoningEffort`, and `datedSectionsToKeep`;
- `knowledgeWriterByHost` per-host field overrides (see below).

`memory.autoUpdate` defaults to `true` and applies only when
`memory.externalDocPaths` is non-empty. It governs existing external documents
after the selected Truth/ADR writer assignments; it is distinct from the
top-level `autoUpdate` version-guidance toggle.

`knowledgeWriter.externalSkills` replaces the built-in writer assignment when
non-empty. `executionPolicy` accepts `main-agent`, `background`, or `subagent`
and may be omitted entirely. Each host resolves an omitted or unsupported
policy against its capability matrix default: Codex defaults to `background`
(all three policies available); Cindy and DSH default to `subagent` with
`main-agent` also available; OpenCode and the standard hostless flow default
to `background` and `main-agent` respectively. `main-agent` collects no
transcripts or reports and never creates a finalization job: the invoking
agent itself runs the `claw knowledge prepare/complete --source agent-memory`
closeout from its own memory. Explicitly requesting a policy the host cannot
run fails fast at plan closeout instead of silently degrading, except the
legacy Cindy/DSH background-to-subagent coercion. A null model uses the host
default.

`knowledgeWriterByHost` overrides the base `knowledgeWriter` per integration
host (`codex`, `opencode`, `cindy`, `dsh`, `standard`) with field-level
merging; unspecified fields inherit the base writer. It lets one repository
serve hosts with different capabilities, for example a `main-agent` default
with Codex opting into `subagent`.

`version` is the project's expected claw protocol version. `claw context`
aligns an older project version upward and reports when the installed CLI lags
a newer project. `maxTasksToKeep` defaults to 9 archived tasks.

`planning` defaults to `true`. `defaultPlanTemplate` selects a project-owned
template only when the command does not provide an explicit template.
Project-defined template values belong under `var`; do not add unknown
top-level fields.

The default local embedding model is
`jinaai/jina-embeddings-v2-base-zh` with 768 output dimensions. Keep model and
output dimensionality aligned when overriding it.

## Safe editing flow

1. Decide team versus personal scope.
2. Read the current target file and preserve unrelated fields.
3. Apply only the requested change using valid two-space JSON.
4. Run `claw check` after changing `.claw/project.json`.
5. Never commit `.claw/project-override.json` or invent a new field when a
   canonical field already covers the behavior.
