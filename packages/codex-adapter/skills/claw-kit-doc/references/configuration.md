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
  `reasoningEffort`, and `datedSectionsToKeep`.

`memory.autoUpdate` defaults to `true` and applies only when
`memory.externalDocPaths` is non-empty. It governs existing external documents
after the selected Truth/ADR writer assignments; it is distinct from the
top-level `autoUpdate` version-guidance toggle.

`knowledgeWriter.externalSkills` replaces the built-in writer assignment when
non-empty. `executionPolicy` accepts `background` or `subagent`; `subagent` is
supported by Codex and Cindy. A null model uses the host default.

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
