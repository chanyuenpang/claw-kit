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

It also covers the worker-side module-resolution boundary for `@huggingface/transformers`:

- `createRequire(process.cwd() + '/')` was rejected because it reattached runtime dependency ownership to the calling project and conflicted with the self-sufficient local embedding design
- `packages/core/src/embedding-worker.ts` now resolves the transformers module through `resolveTransformersModule(projectRequire, workerRequire)`
- resolution first tries the calling project graph and then falls back to `createRequire(import.meta.url)` against the `@veewo/claw-core` install
- that keeps the runtime dependency ownership with `@veewo/claw-core` while still allowing a project-local override when the project already depends on `@huggingface/transformers`

This work also confirmed several boundaries:

- `.claw/project.json` is repo-scoped project config and must not persist machine-specific absolute cache paths as implicit defaults
- `project.json` should primarily express the embedding configuration in use, not the default model file location
- project cwd continues to govern project config and model cache resolution, but not claw-core runtime dependency ownership
- explicit `memory.embedding.local.modelCacheDir` must remain supported
- if either the explicit local cache or the global cache already contains the target model, the runtime should reuse it instead of downloading again
- When GitNexus needs the same model, `claw` may best-effort seed the GitNexus transformers cache from a matching existing claw model cache to avoid duplicate downloads, but that is only a cache-priming shortcut and does not change shared-cache semantics.

这次 `tiny-world` 的修复把一个更窄但更重要的故障类也固定下来：当共享全局模型缓存里的 `Snowflake/snowflake-arctic-embed-m-v2.0` 已经损坏、缺失或不完整时，正确的修复路径不是回退到项目本地 `.claw/models` 作为默认补救方案，而是清理损坏的全局模型目录，重新恢复共享缓存，然后用真实的 search / index refresh 重新验证模型加载与检索链路。

## Decision

- Default local embedding cache resolution moves to a runtime-resolved user-level shared cache directory.
- The shared default is not persisted into `.claw/project.json`.
- New projects no longer write a default `modelCacheDir` into `project.json`.
- Protocol repair removes the legacy default `.claw/models` from project config so shared-cache behavior becomes implicit.
- Legacy project cleanup must not persist `memory.embedding.local.modelCacheDir = ".claw/models"` back into `.claw/project.json` after the project has been moved to shared-cache semantics.
- If the target model already exists in the platform-global cache, cleanup keeps the global copy and removes the duplicate project-local cache tree.
- This is a one-time legacy cache cleanup for existing projects, not a new project-level default model-directory policy.
- 这套语义在 `D:\Users\chany\Documents\claw-kit` 的实际清理里已经得到验证：`.claw/project.json` 里移除了 `memory.embedding.local.modelCacheDir = ".claw/models"`，项目内 `.claw/models` 已删除，保留的是 `C:\Users\chany\AppData\Local\claw\models` 里的共享副本。
- 当共享全局缓存损坏或不完整时，优先修复全局模型目录并恢复共享副本，再通过真实的 search / index refresh 验证可加载性；不要把 project-local fallback 提升成这类故障的默认修复 lane。
- 这次 tiny-world 修复确认：只要共享全局 `Snowflake/snowflake-arctic-embed-m-v2.0` 缓存可被恢复，仓库侧就不需要通过重写 `.claw/project.json` 来绕开损坏状态。

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
- For this failure class, repair flows should clear and restore the shared global model directory first, then revalidate with real search / index refresh; project-local fallback is not the default repair path.
- Project config rewrites are not the canonical remediation for corrupted shared model cache state.
- Cache priming from an existing claw model cache is opportunistic only; it does not create a new shared-cache contract or alter the user-level shared default.

## Related Code

- `packages/core/src/embedding-defaults.ts`
- `packages/core/src/embedding-worker.ts`
- `packages/core/src/embedding-transformers.ts`
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
