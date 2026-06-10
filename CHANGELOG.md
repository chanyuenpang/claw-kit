# Changelog

All notable release-oriented changes for `claw-kit` should be recorded here.

## [0.1.25] - 2026-06-10

### Changed

- `claw plan write` now supports the minimal `claw plan write "<title>" [--goal "<text>"]` root-plan entrypoint
- requirements-stage workflow guidance now tells agents to fill `goal.text` first when it is missing, then complete the remaining plan fields and move to `process.active` as soon as requirements are clear
- `workflowGuidance.goalMode` is now emitted on first entry into `process.active` instead of on `plan write`, and Codex adapter guidance was aligned to that lifecycle

### Fixed

- plans can no longer enter `process.active` without `goal.text`, making the goal gate an enforced lifecycle rule instead of prompt-only advice
- delegated writer contracts now explicitly include `fork_context: false` so narrow deposition workers do not inherit full thread history by default

## [0.1.24] - 2026-06-09

### Fixed

- project memory refresh now backfills vectors for existing docs when sqlite `docs` rows remain but `doc_embeddings` are missing
- `claw search index --refresh` continues to fail when embedding generation fails, instead of degrading to text-only success

### Added

- regression coverage for the "existing docs plus missing embeddings" repair path

## [0.1.23] - 2026-06-09

### Added

- vector-backed project recall now includes local embedding refresh, incremental indexing, and improved candidate reranking for conversational queries

### Fixed

- project memory refresh now degrades cleanly when local embedding generation is unavailable, preserving text indexing and release-time completion refresh
- project search once again reports `MEMORY_VECTOR_INDEX_REQUIRED` when a vector index is unavailable instead of failing with a generic embedding-generation error

## [0.1.22] - 2026-06-09

### Fixed

- subplan completion now resumes the parent plan workflow instead of leaving the task pinned to the child plan
- parent task state and `meta.activePlan` now recover cleanly after subplan completion, so `plan done` continues the restored parent workflow instead of archiving the whole task

### Added

- core and CLI regression coverage for `subplan -> complete -> resume parent plan`

## [0.1.21] - 2026-06-09

### Changed

- explicit `@claw-kit` entry now recovers startup state with `claw context` when no harness state has been injected yet, allowing non-initialized projects to bootstrap cleanly on demand
- Codex adapter bootstrap guidance, validation notes, and default prompts now document the explicit recovery path while keeping background `SessionStart` behavior conservative outside `.claw` projects

## [0.1.19] - 2026-06-08

### Added

- archived-task fallback for `claw plan show`, returning archived plan views when the active task has already been moved under `.claw/archive/tasks/`
- explicit `archivedPlanPath` in `claw plan done` results when completion retention archives the current task

### Changed

- unified `SessionStart` recovery now restores session-bound active workflow snapshots through `ownerSessionKey` and recomputed `workflowGuidance`
- `plan write` now binds the current host session onto task metadata for startup recovery
- `.claw/logs/` is now ignored as runtime-only state
## [0.1.12] - 2026-06-08

### Added

- publishable package names `@veewo/claw-core` and `@veewo/claw`
- package-level README files for the publishable packages
- `scripts/install-cli.ps1` for GitHub-based Windows installation
- `DISTRIBUTION.md` for release and npm publish workflow

### Changed

- CLI package metadata and dependency wiring to support npm publishing
- root README install guidance to cover both GitHub install and npm publish flow

### Fixed

- package file lists so `@veewo/claw-core` no longer packs test artifacts
