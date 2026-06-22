# claw-kit

`claw-kit` is an agent-facing, project-level workflow and knowledge capture toolkit.

It uses `.claw` as a practical working surface for planning tasks, recalling prior project knowledge, depositing truth and ADR notes, and closing work out cleanly. In other words, the high-level product idea is project workflow plus knowledge capture for agents, and the concrete landing mechanism is the `.claw` framework for planning, truth/ADR, search, and closeout.

## What it helps with

- Project-scoped planning and task lifecycle around `.claw`
- Truth and ADR deposition so useful knowledge survives across sessions
- Recall-oriented search over project docs before broader investigation
- Closeout workflows that keep tasks, notes, and decisions aligned
- Adapter surfaces that let the same workflow shape land in different agent hosts

## Why teams use it

- Plan before execute: the `.claw` plan structure gives agents a durable workflow to return to, which helps complex or longer-running tasks move forward more steadily than loose chat state alone.
- Flexible by design: `claw-kit` can work alongside other harnesses or external skills instead of assuming a single host or investigation tool.
- Truth and ADR stay reusable: the workflow maintains truth and ADR as durable project knowledge, then makes that context available again through project recall.
- Team-friendly config: `.claw/project.json` holds the shared canonical workflow, while `.claw/project-override.json` leaves room for personal runtime preferences.
- GitNexus can complement that workflow when a task needs deeper code investigation or relationship tracing, but it is optional rather than required.

## How `.claw` workflow lands in practice

In a typical round, `claw-kit` helps an agent move through a repeatable loop:

`plan` -> `search and recall` -> `execute` -> `deposit truth / ADR` -> `close out`

That workflow is the concrete way `claw-kit` turns project knowledge into something reusable instead of leaving it scattered across transient chats or half-finished tasks.

## Where to start

- Want to use the CLI in a project? Start with the install and setup section below, then read the CLI package guide in [packages/cli/README.md](packages/cli/README.md).
- Want to understand the integration surfaces? Jump to the package map.
- Want to configure project behavior? Read the `project.json` guide in [docs/project-json-reference.md](docs/project-json-reference.md).

## Install the CLI

Install the published CLI with:

```powershell
npm install -g @veewo/claw
```

Or use the one-shot install script:

```powershell
.\scripts\install-cli.ps1
```

After the CLI is installed, project search still needs one-time setup inside each target project:

1. Run `claw context` so `.claw/project.json` is normalized and the default local embedding config is present.
2. Run `claw search index --refresh` once so the sqlite recall store, embedding setup, and first vector index are created.

Then use it from any project directory:

```powershell
claw init --max-tasks-to-keep 20 --external-truth-skill external-truth-writer --external-adr-skill external-adr-writer
claw plan write --title "My task" --goal "Define the first task"
```

## Install the Codex plugin

The Codex plugin is a separate distribution surface from the CLI. The source of truth lives in `packages/codex-adapter`, and this repo now exposes two supported commands:

```powershell
npm run export:codex-plugin
npm run install:codex-plugin
```

What they do:

1. `npm run export:codex-plugin` copies the installable plugin payload into `dist/codex-plugin/claw-kit/<plugin-version>/`.
2. `npm run install:codex-plugin` copies that same payload shape into the local Codex cache at `%USERPROFILE%\.codex\plugins\cache\claw-kit-local\claw-kit\<plugin-version>\`.

Use `install:codex-plugin` when you want this machine to start using the adapter immediately. Use `export:codex-plugin` when you want a clean versioned bundle that can be attached to a release, copied to another machine, or used by another installer.

## Package map

- `@veewo/claw`
  - CLI entrypoint for running the `.claw` workflow in a project
- `@veewo/claw-core`
  - shared workflow primitives for project config, planning, search, truth ingestion, and retention
- `@claw-kit/codex-adapter`
  - Codex-facing adapter assets, hooks, skills, and references for landing the workflow in Codex
- `@claw-kit/openclaw-adapter`
  - OpenClaw-facing adapter layer built on the same core workflow model

## `project.json` at a glance

`.claw/project.json` is the canonical team-owned project config for `claw-kit`. It controls the shared workflow surface for things like memory, external docs, writer overrides, workflow toggles, and GitNexus integration.

Use [docs/project-json-reference.md](docs/project-json-reference.md) for the full guide, including:

- canonical `.claw/project.json` versus local `.claw/project-override.json`
- field-by-field explanations for `memory`, `workflow`, `gitnexus`, and writer overrides
- copyable examples for local embeddings, external docs, and workflow toggles

The current repo's own canonical config looks like this:

```json
{
  "id": "claw-kit",
  "name": "claw-kit",
  "maxTasksToKeep": 9,
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
  "externalTruthSkill": null,
  "externalAdrSkill": null,
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

## Search and recall

`claw search` is a project-scoped recall command for project documentation surfaces such as `.claw` memory, truth, ADR, and markdown files from `memory.externalDocPaths`. Its job is to absorb a natural-language prompt or keyword query against project docs, recover prior truth and ADR context, and narrow the search space before deeper investigation or code-location work.

Configured `memory.externalDocPaths` are treated as markdown-only recall roots: `claw search` indexes `.md` files from those paths rather than arbitrary text or code files.

Project search expects a refreshed vector index. Configure `memory.embedding` and run `claw search index --refresh` before using either `claw search "topic"` or `claw search --query "topic"`.

Recommended first-time search setup from a project root:

```powershell
claw context
claw search index --refresh
```

That first refresh creates the project-local sqlite recall store at `.claw/memory.sqlite`, resolves the local embedding cache, and writes the initial vector index for searchable markdown docs. By default, claw uses a platform-global model cache directory (`%LOCALAPPDATA%\\claw\\models` on Windows, `~/Library/Caches/claw/models` on macOS, and `$XDG_CACHE_HOME/claw/models` or `~/.cache/claw/models` on Linux). Project-local `.claw/models` remains a fallback cache location instead of the default primary cache.

`claw search index --refresh` incrementally syncs the current project's markdown recall index. Unchanged docs reuse existing sqlite rows and embeddings, changed docs are re-embedded, deleted docs are removed, and embedding config changes trigger a full vector refresh. On large projects, refresh defaults to processing at most 100 newly added or changed files per run so the backlog can advance across multiple refreshes.

For local semantic indexing, `provider: "local"` defaults to `Snowflake/snowflake-arctic-embed-m-v2.0` with 768 dimensions, worker-side batch inference, and Windows DirectML-to-CPU fallback. Existing projects that explicitly keep `Snowflake/snowflake-arctic-embed-xs` continue to resolve to 384 dimensions unless they override `outputDimensionality`.

If you explicitly set `memory.embedding.local.modelCacheDir`, claw resolves cache usage in this order:

1. If that configured local cache already contains the target model, use it.
2. Otherwise, if the platform-global cache already contains the target model, reuse the global cache.
3. Otherwise, download the model into the configured local cache.

If `memory.embedding.local.modelCacheDir` is not set, claw uses the platform-global cache by default and only falls back to `.claw/models` when the global cache directory is unavailable.

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

## Maintainer docs

For release and distribution steps, use the dedicated maintainer docs in [DISTRIBUTION.md](DISTRIBUTION.md) and [docs/2026-06-08-closeout-workflow.md](docs/2026-06-08-closeout-workflow.md).
