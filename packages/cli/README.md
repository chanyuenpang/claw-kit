# @veewo/claw

Publishable `claw` CLI for `.claw` project bootstrap, planning, search, truth ingestion, and completion refresh.

Install:

```bash
npm install -g @veewo/claw
```

Then run:

```bash
claw init
claw search --query "existing truth or ADR topic"
claw search index --refresh
claw plan write --title "My task" --goal "Define the first task"
```

Codex startup workflow should rely on the session hook/bootstrap to recover startup state instead of treating any extra manual recovery step as required after plan creation.

`claw search` is project-scoped recall for `.claw` memory, truth, ADR, and declared external docs. Use it before plan creation and before research-style investigation when you want prior project context. It is not a code-search command.

Configured `memory.externalDocPaths` only contribute `.md` files to this recall surface.

`claw search index --refresh` incrementally syncs the current project's markdown recall index. Unchanged docs reuse existing sqlite rows and embeddings, changed docs are re-embedded, deleted docs are removed, and embedding config changes trigger a full vector refresh. On large projects, the refresh now defaults to processing at most 100 newly added or changed files per run so the backlog can advance across multiple refreshes.

`claw search index --refresh` supports local semantic indexing with a GitNexus-style transformers backend when `.claw/project.json` sets `memory.embedding.provider` to `local`. Local embedding execution now batches inference inside a single worker/model session by default, and you can still force CPU rescue refreshes with `memory.embedding.local.device = cpu` or `CLAW_EMBEDDING_LOCAL_DEVICE=cpu`.

`claw search --query ...` expects that refreshed vector index to exist. If the project has no vector index yet, the command fails until you configure `memory.embedding` and run `claw search index --refresh`.

Repository:

- [claw-kit](https://github.com/chanyuenpang/claw-kit)
