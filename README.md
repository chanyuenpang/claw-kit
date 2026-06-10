# claw-kit

`claw-kit` is a project-local harness toolkit built around `.claw/`.

## Install CLI

Install the published CLI with:

```powershell
npm install -g @veewo/claw
```

Or use the one-shot install script:

```powershell
.\scripts\install-cli.ps1
```

After the CLI is installed, semantic search still needs one-time project setup:

1. Run `claw context` in the target project so `.claw/project.json` is normalized and the default local embedding config is present.
2. Run one `claw search index --refresh` to create the sqlite index, download or reuse the local embedding model, and build the first batch of vectors.

Then use it from any project directory:

```powershell
claw init --max-tasks-to-keep 20 --external-truth-skill external-truth-writer --external-adr-skill external-adr-writer
claw plan write --title "My task" --goal "Define the first task"
```

## Published npm packages

- CLI package: `@veewo/claw`
- Core package: `@veewo/claw-core`

`project.json` keeps explicit harness settings. External writer overrides are optional and default to the built-in writer skills:

```json
{
  "id": "your-project-id",
  "name": "Your Project Name",
  "maxTasksToKeep": 99,
  "externalTruthSkill": null,
  "externalAdrSkill": null,
  "contextPaths": [],
  "memory": {
    "externalDocPaths": [],
    "embedding": null
  },
  "gitnexus": {
    "enabled": false
  }
}
```

## Core commands

- `claw init`
- `claw context`
- `claw search`
- `claw search index --refresh`
- `claw plan write`
- `claw plan edit`
- `claw switch-task`
- `claw truth ingest`

`claw context` still exists as a CLI command, but Codex workflow bootstrap should recover context through the session hook instead of treating it as a manual post-plan step.

`claw search` is a project-scoped recall command for `.claw` documentation surfaces such as project memory, truth, ADR, and `memory.externalDocPaths`. It is best used before `claw plan write` and before research-style investigation when you want to recover prior project context. It is not the code-search surface; for current implementation or relationship tracing, use a researcher flow with GitNexus-oriented tooling when available.

Configured `memory.externalDocPaths` are treated as markdown-only recall roots: `claw search` indexes `.md` files from those paths rather than arbitrary text or code files.

Project search now expects a refreshed vector index. Configure `memory.embedding` and run `claw search index --refresh` before using `claw search --query ...`.

Recommended first-time search setup from a project root:

```powershell
claw context
claw search index --refresh
```

That first refresh is the point where claw creates the project-local sqlite recall store at `.claw/memory.sqlite`, downloads or reuses the local embedding model cache under `.claw/models`, and writes the initial vector index for searchable markdown docs.

`claw search index --refresh` syncs the current project's recall index incrementally. Unchanged markdown docs keep their existing sqlite rows and embeddings, changed docs are re-embedded, deleted docs are removed, and changing the embedding config triggers a full vector refresh. For large projects, project refresh now defaults to processing at most 100 newly added or changed files per run, so repeated refreshes naturally advance the remaining backlog instead of trying to embed the full corpus in one shot. For local semantic indexing, `provider: "local"` uses a GitNexus-style transformers setup with `Snowflake/snowflake-arctic-embed-xs`, 384 dimensions, worker-side batch inference, and Windows DirectML-to-CPU fallback by default:

```json
{
  "memory": {
    "externalDocPaths": [],
    "embedding": {
      "provider": "local",
      "model": "Snowflake/snowflake-arctic-embed-xs",
      "local": {
        "modelCacheDir": ".claw/models"
      }
    }
  }
}
```

If you need to force a local refresh onto CPU, set either:

- `memory.embedding.local.device` to `cpu` in `.claw/project.json`
- `CLAW_EMBEDDING_LOCAL_DEVICE=cpu` in the current shell for a one-off rescue refresh

If your environment uses remote embeddings, set `memory.embedding` to an OpenAI-style config instead:

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

## Publish workflow

For a real release, use the full maintainer workflow in [DISTRIBUTION.md](G:/Projects/claw-kit/DISTRIBUTION.md) and the local-copy refresh checks in [docs/2026-06-08-closeout-workflow.md](G:/Projects/claw-kit/docs/2026-06-08-closeout-workflow.md).

Quick artifact dry-run:

```powershell
cd packages\core
npm pack --dry-run
cd ..\cli
npm pack --dry-run
```

Actual publish order:

```powershell
cd packages\core
npm publish --access public
cd ..\cli
npm publish --access public
```

Post-publish install verification on Windows:

```powershell
npm install -g @veewo/claw
npm list -g @veewo/claw --depth=0
(Get-Command claw).Source
claw --help
```

`@veewo/claw` depends on `@veewo/claw-core`, so publish `core` first.
