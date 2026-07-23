# Changelog

All notable release-oriented changes for `claw-kit` should be recorded here.

## Unreleased

## [0.1.96] - 2026-07-23

### Changed

- Default root plans with two or fewer total tasks now skip Codex Goal Mode and progress synchronization; template-backed plans and subplans retain their lifecycle integration.

## [0.1.95] - 2026-07-22

### Added

- New project tasks are organized under date-scoped directories, with lock-protected daily maintenance that archives expired task and session state.
- Added `claw plan sync` to restore Codex host progress and Goal Mode after a recovered active workflow.

### Changed

- Plan completion now records retrospective fields atomically before entering the completed state, and task lookups support both legacy and date-scoped layouts.

### Fixed

- Knowledge finalization no longer creates implicit Git commits, preserving caller-owned working tree state.

## [0.1.94] - 2026-07-22

### Added

- Added a persistent search reader with bounded project database/vector caches and a lightweight CLI search entrypoint
- Added compact normalized Float32 BLOB vector storage with automatic backfill for existing indexes and stage-level search telemetry

### Changed

- Project search now collapses vector chunks by source while scanning, delays snippet reads until final results, and avoids JSON vector decoding on refreshed indexes
- Query embedding generation now talks directly to the persistent embedding daemon, whose reusable session cache retains two compatible model runtimes for ten minutes

### Fixed

- Codex host progress projection now follows the task actually marked in progress instead of assigning progress to the first unfinished task
- Local embedding runtime fingerprints no longer split otherwise identical model sessions solely by project path
- Updated vulnerable transitive `tar` and `protobufjs` runtime dependencies to patched releases

## [0.1.93] - 2026-07-21

### Changed

- Replaced the single external knowledge-writer skill with an ordered `externalSkills` governance sequence and migration from the retired Truth/ADR fields
- Unified unattended finalizer prompting across built-in and external governance skills while preventing durable documentation from referencing transient finalization inputs
- `release-claw-kit` is now a repository-local maintainer skill and is no longer included in the published Codex plugin

## [0.1.92] - 2026-07-21

### Added

- Project configuration now supports `autoCommitKnowledge`, allowing successful Truth/ADR finalization to leave documentation changes uncommitted when explicitly disabled

### Changed

- Active plans keep using their original template contract during task completion and plan editing even after the installed template version advances

### Fixed

- The Codex update workflow now avoids stale copied guidance that conflicted with the published-source update contract

## [0.1.91] - 2026-07-21

### Added

- Knowledge finalization now commits only finalizer-owned Truth/ADR changes through an isolated Git index while preserving pre-existing dirty files and staged entries

### Changed

- `create-claw-skill` now confirms user requirements before conversion, adapts task descriptions without deleting sub-tasks or changing guidance-sensitive task ids, and routes broad workflow changes to its fallback
- Active claw plans are explicitly treated as adaptable task containers that may add sub-tasks when later user requirements expand the work

### Fixed

- Codex plan closeout no longer repeats an already-consumed Goal completion instruction in the compact result

## [0.1.90] - 2026-07-20

### Fixed

- The Codex update workflow now preserves an already-created plan across a CLI/template version handoff by using the matching published CLI only for its remaining plan mutations

## [0.1.89] - 2026-07-20

### Changed

- Default planning now distinguishes action instructions from open-ended discussion, names the configured planning skill in Task 1, and pauses only when an undisclosed solution introduces a meaningful user choice
- Workflow guidance renames `recommendedCommands` to `commandHints` as a breaking contract cleanup, with no legacy aliases, dual writes, or fallback compatibility
- Codex and OpenCode entry guidance defines `process.discussing` as a stable execution pause that can be entered initially or resumed from `process.active`

### Fixed

- Command lookup hints no longer read like required lifecycle actions, reducing accidental advancement beyond the current stage and task

## [0.1.88] - 2026-07-20

### Added

- A Codex-owned `release-claw-kit` template that sequences direct-main release preparation, guarded publishing, artifact verification, and the separate published-source maintainer update
- Current-turn task completion conclusion capture for Stop reports, using successful existing `task.done` results without a dedicated marker or plan/task identity payload

### Changed

- Codex host actions use a smaller schema-v1 envelope, emit `update_plan` only when the projected host plan changes, and avoid duplicate full-plan summaries during discussion
- The versioned Codex driver now preserves the existing `ok` and `command` fields for successful `task.done` results so Stop can recover all qualifying conclusions from that turn

### Fixed

- A single Stop no longer misses earlier successful `task.done` conclusions from the same agent turn, while replay remains idempotent and capture stays fail-open
- Goal host actions re-check already-satisfied live Goal state without exposing internal policy metadata to the agent

## [0.1.87] - 2026-07-20

### Added

- Versioned claw skill templates that route missing or outdated template contracts through `create-claw-skill`, plus release-time template alignment checks
- Structured Truth/ADR document semantics, bounded dated-history governance, and corpus auditing utilities for large project knowledge bases
- Search ranking diagnostics, candidate snapshots, comparison tooling, and large-corpus generation support

### Changed

- Knowledge retrieval preserves original semantic query text, tracks document and chunk state, and applies temporal selection before document collapse
- `create-claw-skill` and `knowledge-writer` now ship self-contained coverage, reference, and knowledge-format guidance across Codex and OpenCode bundles
- Release verification validates all bundled workflow templates and the expanded plugin payload

### Fixed

- Codex Goal host actions re-check live Goal state before mutation so already-satisfied completion and resume transitions are consumed idempotently
- CLI and OpenClaw release dependencies now stay aligned with the matching `@veewo/claw-core` version

## [0.1.86] - 2026-07-20

### Added

- Tokenizer-aware local embedding chunking with versioned index invalidation, reproducible search-model benchmarks, labeled corpora, and retained Windows result evidence

### Changed

- Jina v2 Base Chinese is now the default 768-dimensional local embedding model, with Snowflake models retained as explicit alternatives and longer first-download request timeouts
- Planning now uses evidence-backed progress checkpoints and follow-up planning tasks, while the default planning bridge discusses requirements and the proposed solution before preparing the task list
- The Codex researcher contract now delegates focused code-only investigation with explicit host routing, compact evidence output, and same-thread reuse
- Repository verification policy now states that testing must not outweigh the work it protects unless a concrete, realistically costly regression risk justifies the additional cost

### Fixed

- Windows GitNexus refresh retries an access-violation failure once with a forced rebuild, and persistent embedding timeouts remain terminal instead of starting a competing model load

## [0.1.85] - 2026-07-19

### Changed

- `claw plan done` now returns a structured completion achievement, the canonical plan path, and guidance for continuing to use claw in the same thread
- The Codex code-mode driver advances to cache version 4 and preserves terminal completion evidence without expanding non-terminal mutation output

### Fixed

- Root and session completion no longer require a follow-up `plan show` read to verify the persisted result, while completed subplans still resume their parent without emitting a misleading terminal achievement

## [0.1.84] - 2026-07-19

### Added

- Completed knowledge finalization now records an observable writer result in the retained task report, and task retention defaults to nine completed reports before pruning
- Project context recovery can warm the configured local embedding session without issuing a search query

### Changed

- Knowledge writing now consumes completed plan and report content in one sequential Truth/ADR pass without input-format routing
- The default planning template uses one outcome-oriented discussion task, resolves the configured planning skill with a built-in fallback, and avoids lifecycle-driven task fragmentation
- `claw plan start` remains optional global syntax sugar; templates declare `guidance.onPlanStart` only when a discussion task deliberately bundles delivery into execution
- `create-claw-skill` now teaches template authors when to adopt or omit `guidance.onPlanStart`, while generated executable templates continue to start directly in `process.active`
- Repository testing guidance now applies TDD only when stable regression protection justifies its implementation and maintenance cost

### Fixed

- Choice-aware task guidance exposes valid ids once and recommends the real `--choice` CLI syntax
- Subplan guidance completes an active parent goal before creating the child goal, preventing Goal Mode conflicts

## [0.1.83] - 2026-07-19

### Added

- `plan create` and `subplan create` accept an exact `--template-file` source, persist it for later task guidance, and keep `--template` as the compatibility id resolver
- Template guidance can interpolate effective `project.json` values by key path, with custom variables declared under the explicit `var.*` namespace

### Changed

- Template-backed skills and the `create-claw-skill` generator now route through their adjacent `TEMPLATE.json`, avoiding collisions across hosts, plugins, and cached versions
- Goal Mode objectives now use the concise grammatical form `Follow the claw workflow guidance and finish your goal: <goal>`

## [0.1.82] - 2026-07-19

### Changed

- The `using-claw-kit` entry contract now uses a simpler binary route: create a project plan when reusable project knowledge is expected, otherwise work directly; session scope remains an explicit CLI capability instead of a default entry route
- Codex and OpenCode now ship independently maintained `update` skills, so each workflow refreshes its own host without an in-plan platform choice
- Template-backed claw skills now route by whole-task, independent-stage, or mixed-stage ownership; batch work is modeled as repeated stage subplans, while mixed-stage use and unavailable claw tooling share one complete adjacent fallback
- Explicit `plan create --template` automatically uses session storage outside a `.claw` project, while plain `plan create` keeps its project-initializing behavior and skill entries no longer expose session-scope routing
- `create-claw-skill` now uses a compact three-task conversion template, a minimal generator command, file-based source validation, and concrete positive and negative choice examples
- `using-claw-kit` now keeps recovery and search routing out of the default entry contract and focuses only on consuming current `workflowGuidance`
- `using-claw-kit` now exits immediately for work that needs no reusable project knowledge; otherwise its minimal First Action selects default or template-backed plan creation, treats returned `workflowGuidance` as the only next-step execution contract, and keeps harness mechanics out of normal thread replies

## [0.1.78] - 2026-07-18

### Added

- OpenCode lifecycle integration now captures session reports and runs host-native combined knowledge closeout, with dedicated startup, guidance, update, hook, and subagent references

### Changed

- `using-claw-kit` is now a compact guidance-first contract: expected reusable knowledge controls plan entry, `process.discussing` remains a stable planning state, and activation requires explicit tasks that can proceed without heavy user participation
- Complexity calibration now distinguishes `direct`, `process.discussing`, and `process.active`, preventing plans that still need intensive user input from entering Goal Mode prematurely
- Codex and OpenCode closeout now use one host-owned knowledge writer instead of separate main-agent truth and ADR dispatch flows, and retired workflow surfaces were removed
- CLI workflow guidance was simplified around canonical two-part plan states, exact returned commands, and host-owned closeout

### Fixed

- Plan lifecycle documentation and regression tests now identify successful completion as canonical `end.completed`; guidance-stage `done` and task status `done` are no longer presented as plan statuses

## [0.1.77] - 2026-07-17

### Fixed

- Codex updates now require the GitHub marketplace source, preventing stale local marketplace installations from satisfying the update gate; `DISTRIBUTION.md` and the closeout workflow docs were updated to match the marketplace-required flow

## [0.1.76] - 2026-07-17

### Changed

- Codex plan mutations now use explicit command fields instead of merge-patch semantics, replacing the previous patch-based `plan-edit` contract
- Codex adapter now owns its versioned SDK runtime, async writer dispatch preserves the model contract, and Codex runtime repair requires explicit user consent
- Codex recall now routes through `claw search` instead of a maintained index surface

### Added

- ADRs recorded for the consolidated goal-routing release: Codex goal-mode thread contract, fixed code-mode host-action consumer, and goal status routing

## [0.1.75] - 2026-07-17

### Fixed

- Codex goals are now routed based on plan status so the host receives the correct goal transition for each plan lifecycle state

## [0.1.74] - 2026-07-17

### Fixed

- Codex goal actions are now dispatched exactly once per transition instead of emitting duplicate host actions

## [0.1.73] - 2026-07-17

### Fixed

- Simplified Codex goal reset and set logic to reduce transitional state churn

## [0.1.72] - 2026-07-17

### Fixed

- Codex goal updates are now idempotent, preventing repeated goal mutations on retries or replays

## [0.1.71] - 2026-07-17

### Added

- Codex code-mode host-action consumer is now enforced, so plan mutations in code-mode go through a fixed consumer contract instead of ad-hoc dispatch

## [0.1.70] - 2026-07-17

### Changed

- Host actions are now consumed in a single code-mode call, reducing redundant host round-trips during plan mutations and execution

## [0.1.69] - 2026-07-17

### Added

- Workflow performance baseline and benchmark scripts (`npm run benchmark:workflow`, `benchmark:complexity`, `benchmark:search`) for measuring end-to-end workflow cost

### Changed

- `claw plan start` now atomically refines and activates a discussing plan in one mutation, appending executable tasks and moving to `process.active` without separate `plan edit` + `plan activate` steps
- Completion refresh work is coalesced to reduce redundant state writes during closeout
- Workflow telemetry and long-tail gates added so slow or stalled workflow paths surface explicitly

### Fixed

- `claw search` recall guidance streamlined to reduce noise during planning

## [0.1.68] - 2026-07-16

### Added

- ADRs recorded: `task-plan-storage-and-session-binding`, `task-retention-pruning-uses-explicit-recursion`

### Changed

- Task plan storage and session bindings restructured to support the new task layout; session-start now restores the session-bound workflow
- Task retention pruning now uses explicit recursion

## [0.1.67] - 2026-07-16

### Changed

- Codex publication now treats the committed Git repository marketplace snapshot as the formal plugin release artifact; GitHub Release ZIP attachments are no longer required.
- Release verification now checks the committed `HEAD` marketplace manifest and required `packages/codex-adapter` payload paths, preventing a working-tree-only or install-time-generated plugin from passing the release gate.
- Truth and ADR writer skills are self-contained delegated-subagent contracts, repository locations are recorded as project-relative paths, and canonical discovery is owned by `claw search` instead of a maintained `SUMMARY.md`.

### Fixed

- Removed the release-handbook step that required attaching an exported Codex plugin ZIP even though repository marketplace installation never consumes it.

## [0.1.63] - 2026-07-15

### Added

- Added the repository Codex marketplace at `.agents/plugins/marketplace.json` and documented the official remote install and upgrade flow.
- Added `claw template validate` for named or file-based templates, including route-choice metadata for tasks that require a choice id.
- Added plan-like skill-local template workflows, authoring guidance, and the `create-claw-skill` scaffold workflow from the integrated remote development line.

### Changed

- `claw plan create`, `claw subplan create`, and `claw template validate --template` now use the same template resolver and validation path.
- The committed `packages/codex-adapter` tree now contains every shared skill and resource required by Codex marketplace installation; release export no longer performs a hidden staging-only sync.
- Release verification now rejects an out-of-sync Codex plugin source and executes bundled template validation from an isolated marketplace-style cache.
- Direct releases are governed from `main` with exact `origin/main` parity and a clean-worktree requirement.

### Fixed

- Fixed remote Codex installations missing `planning` and `config` because those shared skills previously existed only in temporary export staging.
- Fixed the 0.1.62 contract gap where `create-claw-skill` referenced `claw template validate` before the published CLI exposed the command.

## [0.1.62] - 2026-07-14

### Added

- Added the exported `claw-kit:update` workflow skill and included `create-claw-skill` in the generated Codex and OpenCode adapter skill sets.
- Added `npm run verify:release` and `npm run publish:release`; they require a clean, version-aligned release commit already pushed to `origin/main` and verify the exported plugin contains every required shared workflow skill.

### Changed

- Shared skills are copied as complete directories when staging an adapter, so template-backed workflows retain their `TEMPLATE.json` and fallback resources in release bundles.

## [0.1.61] - 2026-07-13

### Fixed

- Codex and OpenCode plugin bundling now materializes shared skills in an isolated staging directory, so exporting or installing a plugin no longer overwrites generated adapter files in the source checkout
- Generated shared-skill adapter copies are no longer tracked; `shared/skills` remains the only editable source

## [0.1.54] - 2026-06-29

### Added

- Plans can now load project-owned templates from `.claw/templates` using `.json`, `.js`, `.cjs`, or `.mjs` files, making it possible to design reusable plan templates directly inside a project

### Changed

- `defaultPlanTemplate` can now be configured in project config and overrides so `claw plan create` uses a project default when `--template` is omitted, while explicit `--template` still takes precedence

## [0.1.52] - 2026-06-24

### Fixed

- Codex workflow guidance now names `update_plan` directly when telling the host to sync or clear thread progress, so progress-sync follow-ups are explicit during active execution and closeout

## [0.1.50] - 2026-06-23

### Fixed

- Default seeded activation tasks now include the Codex Goal Mode recommended objective when `goalMode` is enabled on the default/no-host path, while explicit `host: "opencode"` and disabled Goal Mode keep their existing concise details

## [0.1.46] - 2026-06-22

### Fixed

- `embedding-worker.ts` now resolves `@huggingface/transformers` via `createRequire(cwd)` so the global CLI can find the package from the project's `node_modules` without needing it as a hard dependency; combined with the peerDependencies change in 0.1.45, global CLI install stays fast while `claw search` works in any project with transformers installed

## [0.1.45] - 2026-06-22

### Fixed

- `@huggingface/transformers` is now an optional peer dependency instead of `optionalDependencies`; npm will no longer attempt to install it (and its `onnxruntime-node` transitive dep) when installing the CLI globally — hosts that need embedding already provide it

## [0.1.44] - 2026-06-22

### Fixed

- Move `@huggingface/transformers` from `dependencies` to `optionalDependencies` in `@veewo/claw-core` so global CLI installation no longer pulls in `onnxruntime-node` (~100MB); the package is only needed by `claw search index --refresh` and is dynamically imported

## [0.1.43] - 2026-06-22

### Fixed

- Fix `@veewo/claw` dependency on `@veewo/claw-core` so the global CLI correctly resolves `buildSessionStartDefaultPrompt` / `buildSessionStartRecoveredPrompt` exports from core

## [0.1.42] - 2026-06-22

### Changed

- SessionStart prompt is now driven by the `sessionStart` field in guidance config (`workflow-guidance.config.json` for Codex, `workflow-guidance.opencode.json` for OpenCode), enabling platform-specific prompt text; `buildSessionStartDefaultPrompt` and `buildSessionStartRecoveredPrompt` are exported from core to render templates with variable substitution and conditional snapshot fields
- Codex sessionStart template uses plain `@claw-kit` mentions instead of OpenCode-specific `plugin://` URL syntax
- OpenCode plugin now calls `claw hook SessionStart` to get full dynamic context (authorization, anti-blocking clause, workflowGuidance contract) instead of hardcoding a slim static fallback
- OpenCode plugin re-initializes claw context on `session.compacted` in addition to `session.created`

### Fixed

- `invokeClawSessionStart` now explicitly passes `CLAW_HOST` and `CLAW_GUIDANCE_CONFIG` to the claw subprocess so opencode sessions load the opencode variant config
- `claw-truth-writer` and `claw-adr-writer` agents now use `zhipu-coding-plan/glm-5-turbo` instead of unavailable `anthropic/claude-haiku-4-5`
- Removed deprecated `session-start-recovery.mjs` parallel implementation; `hooks.json` already registers the canonical `claw hook SessionStart` CLI command
- OpenCode plugin installer now creates the plugin shim and registers skills paths in `opencode.json`

## [0.1.41] - 2026-06-19

### Changed

- workflow guidance now returns explicit `goalTool` lifecycle contracts for create, blocked, and complete goal transitions while preserving project-level workflow override gates
- planning guidance now treats no-file discussion or doc-only work as simple scoring inputs and raises the direct-path cutoff to `score < 6`

### Fixed

- Codex workflow guidance no longer suggests starting Goal mode during `prepare.requirements`, and core/CLI regression coverage now locks the active, paused, resumed, and completed goal-tool contract surfaces

## [0.1.40] - 2026-06-16

### Changed

- project config now supports canonical workflow toggles for `goalMode` and `truthDispatch`, while runtime context resolution deep-merges a local `.claw/project-override.json` overlay over the team-owned `.claw/project.json`
- `claw init` now ignores `.claw/project-override.json` by default so personal local overrides stay out of version control while the canonical project config remains committed

### Fixed

- workflow guidance now suppresses `goalMode` when `workflow.goalMode.enabled = false`, and suppresses mid-task `truth-writer` delegation when `workflow.truthDispatch.mode = final_only` while still preserving final closeout deposition
- core and CLI regression coverage now lock the override merge semantics, explicit-`null` override behavior, and the workflow toggle release contract

## [0.1.39] - 2026-06-14

### Changed

- Codex adapter researcher dispatch guidance now treats research work as a blocking specialist handoff, so host agents must wait for the result instead of skipping ahead

### Fixed

- Codex adapter contracts now explicitly keep the host from reading search skill content inline before researcher dispatch, tightening the specialist bundle boundary for subagent routing

## [0.1.38] - 2026-06-12

### Changed

- `process.allTasksDone` guidance now tells agents to update both `retrospective` and `keyDecisions` before ADR closeout, and surfaces a patch-oriented follow-up command for completing the final plan state

### Fixed

- Codex workflow-skill guidance once again preserves the guarded goal-mode contract, the deferred subagent-tool discovery fallback, and the closeout checklist formatting needed for reliable `@claw-kit` execution

## [0.1.37] - 2026-06-12

### Changed

- planning now uses an explicit complexity scoring heuristic, including a documented `score < 4` direct path that skips formal planning but still allows a pre-execution `claw search` recall step when project context matters
- Codex workflow entry now tells agents to use `claw direct` for low-complexity rounds, optionally run `claw search` before execution on that path, and only dispatch `truth-writer` when reusable truth was produced
- the CLI now exposes `claw direct`, which returns a compact low-complexity closeout contract with a `truth-writer` delegate and reuses the same asynchronous completion refresh path as `claw plan done`
- `process.allTasksDone` guidance now tells agents to update both `retrospective` and `keyDecisions` before ADR closeout, instead of only writing the retrospective summary

### Fixed

- core and CLI regression coverage now lock the direct no-plan workflow contract, including asynchronous refresh and local help surface coverage

## [0.1.36] - 2026-06-12

### Changed

- `claw plan done` now runs a foreground GitNexus preflight when `gitnexus.enabled = true`, auto-installs and sets up GitNexus when needed, self-heals persisted `embeddings` analyze mode, and best-effort seeds the matching transformers cache before background refresh continues
- Codex workflow and closeout guidance now explicitly require root-plan closeout checks for writer delegation and task-related doc residue, and the workflow adds a compact truth/ADR contract for delegated writers, main-agent truth curation, and required ADR closeout
- Codex-side non-`.claw` project bootstrap now has a dedicated `init` skill that treats an explicit `claw context` call as the visible initialization action

### Fixed

- CLI and core regression coverage now lock the stricter permission wording, GitNexus preflight/install failure path, embeddings self-heal path, and closeout-oriented workflow guidance behavior to the current contract

## [0.1.35] - 2026-06-12

### Changed

- workflow guidance steps that return `delegateSubagents` now explicitly tell agents to read the structured dispatch entries and execute them field-by-field instead of treating delegation like optional follow-up advice

### Fixed

- Codex adapter workflow-guidance references and core/CLI regression coverage now lock the delegated subagent contract to the stricter mandatory wording, reducing the chance that release prompts drift back toward suggestion-style dispatch

## [0.1.34] - 2026-06-12

### Changed

- `workflowGuidance` now has explicit paused and discussion execution states so `process.wait` and `process.discussing` tell the agent to pause Goal Mode instead of pretending execution is still active
- resuming a paused plan back into `process.active` now re-emits Goal Mode restart guidance through the compact workflow contract

### Fixed

- core and CLI workflow guidance now distinguish first entry into `process.active` from resume-after-pause, keeping `goalMode.setWhen` aligned with the actual lifecycle transition
- canonical release truth and shared embedding cache ADRs now reflect the current 0.1.33 release/install facts and the recovered repair lane for corrupted shared global embedding cache state

## [0.1.33] - 2026-06-11

### Changed

- local embedding cache resolution now defaults to a platform-global shared model cache instead of persisting `.claw/models` into project config
- projects that explicitly configure a local cache now reuse the global model when the local directory is empty, and only download into the explicit local directory when neither cache already has the model

### Fixed

- `claw init` and protocol normalization no longer re-persist the legacy default `memory.embedding.local.modelCacheDir = ".claw/models"` into `.claw/project.json`
- the `claw-kit` repo's own `.claw/project.json` and canonical truth now reflect the shared-cache contract after the local model tree was folded into the Windows global cache

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
