# 2026-06-11 shared embedding cache design

## Problem

`claw-kit` currently defaults local embedding model caching to project-local `.claw/models`.

That behavior is wired through the current implementation chain:

- `packages/core/src/embedding-defaults.ts` sets `DEFAULT_LOCAL_EMBEDDING_CACHE_DIR = ".claw/models"`.
- `packages/core/src/init.ts` writes that default into new `.claw/project.json`.
- `packages/core/src/project-check.ts` normalizes malformed or incomplete `project.json` back to the same default during `claw context` and `claw check`.
- `packages/core/src/embedding-worker.ts` forwards `memory.embedding.local.modelCacheDir` into `@huggingface/transformers` via `env.cacheDir`.

The result is that every project naturally downloads and stores its own 1G+ local ONNX model copy, even when all projects use the same local embedding model.

## Goals

- Make local embedding model caching reusable across projects by default.
- Keep explicit per-project `memory.embedding.local.modelCacheDir` overrides fully supported.
- Preserve compatibility for existing projects.
- Avoid storing machine-specific absolute cache paths in repo-committed `.claw/project.json`.
- Keep migration verifiable through existing `claw init`, `claw context`, and `claw check` flows.

## Non-goals

- Changing remote embedding behavior.
- Introducing a separate migration command just for model cache relocation.
- Moving vector indexes or sqlite data out of `.claw`; this design only changes model artifact caching.

## Constraints

### `.claw/project.json` is repository data

`project.json` is intended to live in the repo. A default like `C:\Users\name\AppData\Local\claw\models` or `/home/name/.cache/claw/models` must not be persisted into the file as an implicit default, because that would write user-machine-specific state into versioned project config.

### Explicit config must keep priority

If a project explicitly sets `memory.embedding.local.modelCacheDir`, that value must continue to win over any runtime default.

### Existing normalization is the migration hook

`claw context` and `claw check` already rewrite `.claw/project.json` through `ensureProjectProtocol -> normalizeProjectConfig`. That is the safest existing place to migrate old default values without adding a second compatibility mechanism.

## Options considered

### Option A: Keep `.claw/models` and require manual shared-cache config

Pros:

- Minimal code change.
- No migration behavior needed.

Cons:

- Does not fix the default multi-project waste.
- Every new project still pays the full download cost unless the user remembers to override it.

Rejected because it leaves the core problem unsolved.

### Option B: Change the default config value to an absolute shared path

Pros:

- Conceptually simple.
- Existing worker flow can keep consuming `modelCacheDir` as-is.

Cons:

- Writes machine-specific absolute paths into `.claw/project.json`.
- Pollutes repo config with user-local state.
- Creates cross-user and cross-machine churn in versioned files.

Rejected because it breaks the config boundary.

### Option C: Make shared cache the runtime default, and stop persisting the default cache path

Pros:

- Fixes the default multi-project waste.
- Keeps repo config portable.
- Preserves explicit override behavior cleanly.
- Gives an easy migration story for old `.claw/models` defaults.

Cons:

- Requires touching init, normalization, runtime resolution, docs, and tests together.

Recommended.

## Recommended design

### Core semantic change

For local embeddings, a missing `memory.embedding.local.modelCacheDir` should now mean:

`use the platform-specific user-level shared claw model cache`

It should no longer mean:

`write vectors into project-local .claw/models`

### Runtime resolution

Add a runtime resolver for the shared default model cache directory in `packages/core/src/embedding-defaults.ts`.

Recommended platform mapping:

- Windows: `%LOCALAPPDATA%\\claw\\models`
- macOS: `~/Library/Caches/claw/models`
- Linux: `$XDG_CACHE_HOME/claw/models`, else `~/.cache/claw/models`

`packages/core/src/embedding-worker.ts` should resolve cache usage in this order:

1. Explicit `memory.embedding.local.modelCacheDir`
2. Runtime shared-cache default from the resolver above

The worker should continue to pass the resolved path into `env.cacheDir`.

### Config persistence rules

`packages/core/src/init.ts` should stop writing a default `local.modelCacheDir` into new project config.

`packages/core/src/project-check.ts` should normalize local embedding defaults like this:

- If local embedding config is absent or incomplete, synthesize a valid local embedding config without persisting `modelCacheDir`.
- If `modelCacheDir` is explicitly set to legacy default `.claw/models`, remove the field during normalization so the project adopts the new shared default.
- If `modelCacheDir` is set to any other value, preserve it unchanged.

This keeps the config portable while still allowing explicit project-specific control.

### Compatibility contract

New projects:

- Default to shared cache automatically.
- Do not store machine-specific cache paths in `.claw/project.json`.

Existing projects still on the legacy default:

- If `memory.embedding.local.modelCacheDir` equals `.claw/models`, `claw context` and `claw check` should normalize it away.
- After normalization, the project uses the shared runtime default.

Existing projects with explicit custom cache locations:

- No automatic change.

Remote embeddings:

- No change.

## Implementation touchpoints

- `packages/core/src/embedding-defaults.ts`
  - add shared-cache runtime resolver
  - retire the meaning of `.claw/models` as a persisted default
- `packages/core/src/embedding-worker.ts`
  - resolve effective cache directory at runtime when `modelCacheDir` is absent
- `packages/core/src/init.ts`
  - stop writing default `modelCacheDir` into new projects
- `packages/core/src/project-check.ts`
  - normalize old default `.claw/models` into omitted `modelCacheDir`
  - preserve explicit non-legacy paths
- `packages/core/src/context.ts`
  - keep trimming and reading explicit values; no special migration logic should be needed there
- `README.md` and `packages/cli/README.md`
  - update wording from project-local `.claw/models` to shared default cache semantics plus override behavior
- tests in `packages/core/test/core.test.ts` and `packages/cli/test/cli.test.ts`
  - update legacy-default expectations
  - add migration coverage
  - add runtime default-cache coverage

## Verification plan

### Unit and integration tests

- `initProject` test:
  - new `.claw/project.json` should not persist `local.modelCacheDir` by default
- `claw context` auto-correction test:
  - incomplete config normalizes to local embedding defaults without persisted `modelCacheDir`
- legacy migration test:
  - config containing `.claw/models` is rewritten without `modelCacheDir`
- explicit override preservation test:
  - custom `modelCacheDir` survives `claw context` and `claw check`
- embedding worker test:
  - when `modelCacheDir` is absent, runtime resolver path is used

### Manual smoke verification

1. Create project A and project B with default local embeddings.
2. Run `claw context` in both.
3. Confirm their `.claw/project.json` files do not contain `modelCacheDir`.
4. Run `claw search index --refresh` in project A and allow the model download.
5. Run the same refresh in project B.
6. Confirm the second project reuses the shared cache instead of downloading another full model copy.

## Risks and mitigations

### Risk: hidden behavior change for users who relied on `.claw/models`

Mitigation:

- Only auto-migrate the exact legacy default `.claw/models`.
- Preserve any explicit non-legacy path unchanged.

### Risk: path resolver differences across platforms

Mitigation:

- Centralize resolution in one helper.
- Cover Windows and POSIX branches in tests.

### Risk: docs and tests drift from runtime semantics

Mitigation:

- Land init, normalization, runtime, tests, and docs in the same change.

## Decision

Adopt Option C.

`claw-kit` should move from a persisted project-local model cache default to a runtime-resolved user-level shared cache default, while preserving explicit per-project overrides and automatically migrating only the legacy default `.claw/models`.
