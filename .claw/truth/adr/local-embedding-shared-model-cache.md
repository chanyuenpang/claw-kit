# ADR: Local embedding shared model cache

## Status

Accepted

## Context

`claw-kit` originally treated project-local `.claw/models` as the default local embedding cache directory.

- `packages/core/src/embedding-defaults.ts` defined `DEFAULT_LOCAL_EMBEDDING_CACHE_DIR = ".claw/models"`
- `packages/core/src/init.ts` wrote that default into new `.claw/project.json`
- `packages/core/src/project-check.ts` restored the same value during `claw context` / `claw check` protocol repair
- `packages/core/src/embedding-worker.ts` forwarded `memory.embedding.local.modelCacheDir` into `@huggingface/transformers` via `env.cacheDir`

That behavior made every project naturally download and keep its own 1G+ ONNX model copy even when multiple projects used the same local embedding model.

This ADR now also covers the legacy cache cleanup path:

- when a project still carries `memory.embedding.local.modelCacheDir = ".claw/models"` from the old default, that config entry must be removed during cleanup
- when the target model already exists in the platform-global cache, the global copy is preserved and the duplicate project-local directory is cleaned up
- the cleanup returns the project to implicit shared-cache semantics instead of reintroducing a project-level default model directory

This work also confirmed several boundaries:

- `.claw/project.json` is repo-scoped project config and must not persist machine-specific absolute cache paths as implicit defaults
- `project.json` should primarily express the embedding configuration in use, not the default model file location
- explicit `memory.embedding.local.modelCacheDir` must remain supported
- if either the explicit local cache or the global cache already contains the target model, the runtime should reuse it instead of downloading again

## Decision

- Default local embedding cache resolution moves to a runtime-resolved user-level shared cache directory.
- The shared default is not persisted into `.claw/project.json`.
- New projects no longer write a default `modelCacheDir` into `project.json`.
- Protocol repair removes the legacy default `.claw/models` from project config so shared-cache behavior becomes implicit.
- Legacy project cleanup must not persist `memory.embedding.local.modelCacheDir = ".claw/models"` back into `.claw/project.json` after the project has been moved to shared-cache semantics.
- If the target model already exists in the platform-global cache, cleanup keeps the global copy and removes the duplicate project-local cache tree.
- This is a one-time legacy cache cleanup for existing projects, not a new project-level default model-directory policy.
- 这套语义在 `D:\Users\chany\Documents\claw-kit` 的实际清理里已经得到验证：`.claw/project.json` 里移除了 `memory.embedding.local.modelCacheDir = ".claw/models"`，项目内 `.claw/models` 已删除，保留的是 `C:\Users\chany\AppData\Local\claw\models` 里的共享副本。

Runtime cache resolution for a target local embedding model now works in this order:

1. If `memory.embedding.local.modelCacheDir` is explicitly configured and that cache already contains the target model, use the configured local cache.
2. Otherwise, if the platform-global cache already contains the target model, reuse the global cache.
3. Otherwise, if an explicit local cache dir was configured, download the model into that configured local cache.
4. Otherwise, use and download into the platform-global cache.
5. Only if the platform-global cache directory is unavailable, fall back to project-local `.claw/models`.

Recommended platform-global cache roots:

- Windows: `%LOCALAPPDATA%\\claw\\models`
- macOS: `~/Library/Caches/claw/models`
- Linux: `$XDG_CACHE_HOME/claw/models`, otherwise `~/.cache/claw/models`

## Consequences

- New projects reuse local embedding models across repositories by default instead of redownloading the same 1G+ model per repo.
- `.claw/project.json` stays portable and does not accumulate user-machine absolute cache paths.
- Explicit per-project cache configuration is still supported, but its meaning is now:
  - use local first when the local cache already has the model
  - reuse global when local is empty and global already has the model
  - download into the configured local cache when neither location has the model
- The legacy `.claw/models` path remains only as a fallback path when the global cache directory is unavailable.
- Cleaning up a legacy project that still points at `.claw/models` should leave the project without an explicit local cache dir once the global cache can satisfy the model.
- This change only affects model artifact caching. It does not move sqlite recall data, vector indexes, or remote embedding behavior.

## Related Code

- `packages/core/src/embedding-defaults.ts`
- `packages/core/src/embedding-worker.ts`
- `packages/core/src/init.ts`
- `packages/core/src/project-check.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `README.md`
- `packages/cli/README.md`

## Search Terms

- `DEFAULT_LOCAL_EMBEDDING_CACHE_DIR`
- `.claw/models`
- `modelCacheDir`
- `env.cacheDir`
- `resolveLocalEmbeddingCacheDir`
- `LOCALAPPDATA`
- `XDG_CACHE_HOME`
- `ensureProjectProtocol`
- `normalizeProjectConfig`
- `claw context`
- `claw check`
