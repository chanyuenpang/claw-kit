# Changelog

All notable release-oriented changes for `claw-kit` should be recorded here.

## [0.1.32] - 2026-06-11

### Fixed

- local embedding workers now clamp tokenizer max length to the effective model/request cap instead of letting oversized inputs reach ONNX with an invalid sequence shape
- oversized markdown sections are now split into smaller embedding chunks before refresh so local indexing no longer stalls on very long truth or summary documents

### Changed

- local embedding refresh now targets smaller chunk sizes by default, reducing peak memory pressure during CPU indexing runs

## [0.1.31] - 2026-06-11

### Fixed

- `claw --help` and `claw -h` now print usage and exit successfully after global install, matching the repository's release verification contract

## [0.1.30] - 2026-06-11

### Changed

- SessionStart recovery now returns current plan content in both `context.activeWorkflow.planContent` and the additional prompt surface so a half-finished task can resume without reopening the plan first
- the workflow guidance release surface now consistently routes ADR deposition from `all tasks done` before root `claw plan done`, and the CLI help/docs now advertise task status updates plus single-reference edit flags

### Fixed

- `@veewo/claw-core` build output now ships `workflow-guidance.config.json`, keeping runtime guidance and source guidance aligned in published artifacts
- startup recovery docs and hook strategy notes no longer contradict the current recovered-plan payload behavior

## [0.1.29] - 2026-06-11

### Fixed

- `claw plan done` on Windows now keeps returning JSON even when completion refresh is launched asynchronously in the background
- Windows completion refresh now launches through an external process boundary so async indexing can continue without breaking the caller's stdout capture

### Changed

- completion refresh status files can move through queued and running states before writing the final finished payload, making long local embedding cold starts observable
- release verification now explicitly covers the Windows async completion-refresh launch path together with the final status-file completion path

## [0.1.28] - 2026-06-11

### Changed

- `workflowGuidance.nextStep` is now `workflowGuidance.nextsteps`, returned as a string array across core, CLI, and Codex adapter guidance references
- `workflowGuidance.notes` is now a single string instead of a list, keeping the compact contract flatter for downstream consumers
- `claw plan write` now returns the full canonical `plan` instead of a separate `planSchema` teaching object
- requirements, execution, and completion workflow guidance is now driven through `packages/core/src/workflow-guidance.config.json` so the guidance contract can be edited from one JSON surface

### Fixed

- plan-write, plan-edit, and plan-done compact outputs now stay aligned with the current workflowGuidance contract instead of mixing old `nextStep` and schema-shaped fields
- CLI and core regression coverage now verifies the JSON-backed workflow guidance output, the `nextsteps` array contract, the string `notes` contract, and full-plan return on `plan write`

## [0.1.27] - 2026-06-10

### Changed

- removed the standalone `bootstrap`, `plan-workflow`, `plan-tool-semantics`, and `truth-workflow` Codex skills so the active workflow surface is narrower and centered on `using-claw-kit` plus `planning`
- `using-claw-kit` now makes reading `planning` the first visible action, and `planning` absorbs the lifecycle guidance that had been split across the separate `plan-workflow` skill
- Codex adapter prompts now describe one visible planning lane instead of telling the agent to start by running `claw context`

### Fixed

- the publishable CLI now runs through `dist/bin.js`, suppressing the `node:sqlite` ExperimentalWarning banner during normal `claw` use while preserving CLI behavior
- `claw context` now reports `startupRecovery` instead of `bootstrap` in its JSON result so the active adapter surface no longer carries the old bootstrap concept

## [0.1.26] - 2026-06-10

### Changed

- merged the local workflow-guidance updates with the later `origin/main` search, init, and Codex adapter changes
- `claw plan write` keeps the positional-title root-plan entrypoint while `claw search` also accepts a positional project query
- requirements-stage guidance now keeps the hard `goal.text` gate for entering `process.active` while also treating active `@claw-kit` threads as pre-authorized for later goal-mode and delegated-subagent use

### Fixed

- plans still cannot enter `process.active` without `goal.text`, and `workflowGuidance.goalMode` is emitted on first entry into `process.active` instead of on `plan write`
- delegated writer contracts continue to carry `fork_context: false` and the merged Codex adapter docs/skills now align with that execution contract
- Windows child `node` processes spawned by embedding refresh, hook bootstrap, and GitNexus refresh run hidden, and the merged truth/docs set now passes truth encoding audit

## [0.1.25] - 2026-06-10

### Changed

- `claw plan write` now supports the minimal `claw plan write "<title>" [--goal "<text>"]` root-plan entrypoint
- requirements-stage workflow guidance now tells agents to fill `goal.text` first when it is missing, then complete the remaining plan fields and move to `process.active` as soon as requirements are clear
- `workflowGuidance.goalMode` is now emitted on first entry into `process.active` instead of on `plan write`, and Codex adapter guidance was aligned to that lifecycle

### Fixed

- plans can no longer enter `process.active` without `goal.text`, making the goal gate an enforced lifecycle rule instead of prompt-only advice
- delegated writer contracts now explicitly include `fork_context: false` so narrow deposition workers do not inherit full thread history by default
- Codex `SessionStart` bootstrap prompt is slimmer and no longer repeats project root, protocol-check, or "report recovered state" instructions
- `plan write` workflow guidance now makes goal mode the first required follow-up and treats goal mode plus delegated subagents as pre-authorized within the current `@claw-kit` thread
- Windows child `node` processes spawned by embedding refresh, hook bootstrap, and GitNexus refresh now run with hidden windows to avoid interrupting terminal input

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
