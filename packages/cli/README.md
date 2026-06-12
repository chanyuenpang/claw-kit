# @veewo/claw

Publishable `claw` CLI for `.claw` project startup recovery, planning, search, truth ingestion, and completion refresh.

Install:

```bash
npm install -g @veewo/claw
```

After installing the CLI, semantic search still needs one-time setup inside each `.claw` project:

1. Run `claw context` so `.claw/project.json` is normalized and the default local embedding config is present.
2. Run `claw search index --refresh` once so the local embedding model can be downloaded or reused and the first vector index can be built.

Then run:

```bash
claw init
claw search index --refresh
claw search "existing truth or ADR topic"
claw plan write --title "My task" --goal "Define the first task"
```

Codex startup workflow should rely on the session hook/startup recovery path instead of treating any extra manual recovery step as required after plan creation.

`claw search` is project-scoped recall for project docs: `.claw` memory, truth, ADR, and declared markdown external docs. For normal planned work, call it after `claw plan write` so recall can improve the already-bound task scope; for low-complexity direct work, call it before execution when project context matters; and for research-style investigation, call it before the broader investigation step. It is meant to absorb a natural-language prompt or keyword query against project documentation, recover prior truth and ADR context, and narrow the surface before later code-location work. It is not a code-search command.

Configured `memory.externalDocPaths` only contribute `.md` files to this recall surface.

Recommended first-time search setup from a project root:

```bash
claw context
claw search index --refresh
```

That first refresh creates the project-local sqlite recall store at `.claw/memory.sqlite`, resolves the local embedding cache, and writes the first vector index for searchable markdown docs. By default claw uses a platform-global model cache directory (`%LOCALAPPDATA%\\claw\\models` on Windows, `~/Library/Caches/claw/models` on macOS, and `$XDG_CACHE_HOME/claw/models` or `~/.cache/claw/models` on Linux). Project-local `.claw/models` remains available as a fallback cache location instead of the default primary cache.

`claw search index --refresh` incrementally syncs the current project's markdown recall index. Unchanged docs reuse existing sqlite rows and embeddings, changed docs are re-embedded, deleted docs are removed, and embedding config changes trigger a full vector refresh. On large projects, the refresh now defaults to processing at most 100 newly added or changed files per run so the backlog can advance across multiple refreshes.

`claw search index --refresh` supports local semantic indexing with a GitNexus-style transformers backend when `.claw/project.json` sets `memory.embedding.provider` to `local`. Local embedding execution now batches inference inside a single worker/model session by default, and you can still force CPU rescue refreshes with `memory.embedding.local.device = cpu` or `CLAW_EMBEDDING_LOCAL_DEVICE=cpu`. If you explicitly set `memory.embedding.local.modelCacheDir`, claw first checks that local cache for the target model, then reuses the global cache when it already has the model, and only downloads into the configured local cache when neither location has it. Without an explicit local cache dir, claw downloads into the platform-global cache by default.

`claw search ...` accepts either `claw search "topic"` or `claw search --query "topic"`, and expects that refreshed vector index to exist. If the project has no vector index yet, the command fails until you configure `memory.embedding` and run `claw search index --refresh`.

Repository:

- [claw-kit](https://github.com/chanyuenpang/claw-kit)
