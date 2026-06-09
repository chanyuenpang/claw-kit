# Local claw CLI

## Status

Accepted working truth for local development on this machine.

## Core facts

- `claw init` now exists and bootstraps a minimal `.claw` project.
- The local CLI command surface includes:
  - `claw init`
  - `claw context`
  - `claw search`
  - `claw search index --refresh`
  - `claw plan write`
  - `claw plan edit`
  - `claw switch-task`
  - `claw memory index/search/get` for legacy/debug and low-level index management
  - `claw truth ingest`
- Codex-facing recall should use `claw search --query "<topic>"` as project-scoped document recall for project memory, truth, ADR, and external docs; it is not code search.
- `claw search index --refresh` is the explicit project index refresh entrypoint and returns `search.index.refresh`.
- `claw search index --refresh` 现在会对当前项目的 markdown recall index 做增量同步，而不是每次都全量重建 sqlite store。
- 未变更文档会复用既有 sqlite rows 与 embeddings；变更文档只替换自身 `docs` / `docs_fts` / `doc_embeddings` 记录并重算 embeddings；删除文档会被清理。
- `memory.embedding` 配置变更时，`claw search index --refresh` 会重建全部向量，保证 project search metadata 一致。
- `claw search index --refresh` now builds project-scoped vector data from `memory.embedding` and records `vectorIndex` metadata in the project index.
- When `memory.embedding.provider` is `local`, the CLI follows the GitNexus-style embedding setup with `Snowflake/snowflake-arctic-embed-xs`, 384 dimensions, and Windows DirectML-to-CPU fallback.
- Project-level `claw search --query` now generates a real query embedding and uses a trimmed hybrid recall that fuses vector and FTS results.
- Project-level `claw search --query` now fails with `MEMORY_VECTOR_INDEX_REQUIRED` when the refreshed vector index is missing, instead of silently degrading to non-vector search.
- Task-scope memory search still keeps the previous FTS and task-memory behavior.
- Before writing a new plan, agents may run `claw search --query "<topic>"` to recover relevant project context.
- `claw memory ...` remains available, but it is not the recommended Codex workflow concept.
- Local installation is currently done through `npm link .\\packages\\cli`.
- On this machine, the global wrappers are created under `C:\\nvm4w\\nodejs`.
- 远程 Windows 机器应该优先使用 `scripts/install-cli.ps1`：脚本会执行 `npm install`、`npm run build`，移除旧的全局链接，然后用 `npm link --force .\\packages\\cli` 重新链接 CLI。
- 根目录 `README.md` 已把远程用户导向这个安装脚本，而不是要求他们手工拼装安装步骤。

## Practical implications

- `claw` can now be used as a normal shell command during local development.
- New projects do not need manual `.claw` scaffolding before they can enter the harness flow.
- Workflow docs and skills should say `claw search`, not OpenClaw-style "memory search", when explaining recall to Codex agents.
- Code investigation should still go through `researcher` plus GitNexus, not `claw search`.
- The hybrid project search contract is influenced by `openclaw-dev`, but only the smallest subset needed for `claw-kit` was brought over.
- incremental refresh 的 sync 语义同样参考 `openclaw-dev`，但这里只保留了适合 `claw-kit` 的裁剪式 sqlite 增量行为。
- README、`packages/cli/README.md` 与 `packages/core/test/core.test.ts` 已说明并覆盖这套 refresh 合同。
