# Cindy workflow route

## Status

Current

<!-- state: current -->
## Current behavior

- The claw-kit Cindy plugin (`claw-kit` ghost, version `0.2.15.1`) exposes exactly two top-level tools: `list_tools` and `call_tool`. All workflow operations are second-level dispatch: the caller calls `call_tool` with `name` and `args`, and the plugin resolves the operation from its declared categories.
- The plugin workflow category exposes plan/task operations and `knowledge.materials` for the new source-plan writer. Plan state is canonical in the `.claw` project `plan.json`; the Cindy card is a projection of that store. Legacy claim/done operations remain compatibility APIs, not prerequisites for new source-plan dispatch.
- The normal Cindy `plan.create` catalog does not expose a storage `scope` argument. New public plans use the unified project workflow; `knowledge_capture` controls accumulation, not storage. Retained legacy session manifests may resume existing workflows but cannot redirect new plan creation. Core retains internal session scope for compatibility including legacy delegate workflows.
- A new plan created in a Cindy session starts in `process.discussing`; execution advances with `plan.start`, and a completed plan reaches `end.completed`.
- When a completed task declares no `onDone` choices, passing a `choice` argument is rejected by validation. That rejection is expected behavior of the schema check, not a workflow failure.
- New Cindy finalization dispatches the originating session key and complete source-plan path. The worker calls `knowledge.materials` to read the source plan and available conversation, then uses an ordinary non-capturing plan and governance subplan; it does not claim a job or call `knowledge.done`. Legacy explicit jobs retain their authenticated claim/done and receipt semantics. See [source-plan handoff ADR](../adr/source-plan-knowledge-handoff.md).
- A source-plan `knowledgeDispatch` carries material coordinates and writer instructions, not a claim credential. Cindy's adapter owns the native source conversation reader; unavailable-history diagnostics remain visible. Legacy job dispatch remains separate.
- The Cindy Ghost worker resolves the CLI from the worker process environment, not from an adapter-pinned CLI install: on Windows it scans `PATH` for the first `claw.cmd`, uses the adjacent `@veewo/claw` Node entry when present, and otherwise preserves that `PATH` entry's shim; non-Windows launches `claw` from `PATH`. `ghost.json`'s `minCindyVersion` is a Cindy Host compatibility declaration, not a CLI version pin. Consequently a stale CLI on the worker `PATH` can lack the new `knowledge.materials` protocol even when the plugin source supports it; this repository evidence does not identify which executable a user's running process resolved. See `packages/cindy-adapter/plugin/node/claw-worker.cjs` (`invocation`, lines 172-186).
- The resident plugin startup invokes private shared-skill preparation once through the existing Node RPC, independently of sessions and workflow admission. Failure is reported without blocking ordinary workflow; no user-facing skills install/status tool is added. The helper uses the adapter's private `sharedSkills` minimum, disables npm scripts, validates package data and replaces official global skill directories without backup or downgrade. This does not promise marketplace-install-window completion, old-session hot reload, or prove real Cindy session loading. See `packages/cindy-adapter/plugin/main.js` (`prepareSharedSkillsAtStartup`, lines 32-49 and startup call at 556), `packages/cindy-adapter/plugin/node/claw-worker.cjs` (prepare-skills handler near line 1060), `packages/cindy-adapter/plugin/node/shared-skills.cjs`, and `packages/cindy-adapter/package.json` (`sharedSkills`).
- Cindy preserves the CLI's original `workflowGuidance.nextsteps` in every workflow result. Its `guidance` object is only an additive local execution mapping and may not filter or replace shared nextsteps, including the required dispatch instruction for a terminal `knowledgeDispatch`.
- Cindy projects plan-tool results through a narrow agent contract: it returns only actionable command/path/status fields, `achievement` when present, complete next steps, the current task or user question, local `guidance`, and a necessary `knowledgeDispatch`. It omits raw plan views, host actions, completion hooks, session/request internals, and duplicate guidance.
- The plugin exposes an unprivileged project-configuration explanation through `ghost.json` `settingsHtml: "panel.html"`, Cindy's supported plugin detail-page configuration surface; it does not declare an unsupported `panel` slot.
- The page documents the only two configuration layers: team-owned `.claw/project.json` and gitignored personal `.claw/project-override.json`. It does not read or write configuration, maintain a second store, or use Cindy Host APIs.

## Implementation and verification anchors

- `packages/cindy-adapter/plugin/ghost.json` (tool surface and `0.2.15.1` version)
- `packages/cindy-adapter/plugin/node/cindy-sqlite-reader.cjs` (ten-second capture delay and plan-boundary scan)
- `packages/cindy-adapter/plugin/main.js`
- `packages/cindy-adapter/plugin/node/claw-worker.cjs`
- `packages/cindy-adapter/plugin/panel.html`
- `packages/cindy-adapter/test/plugin-main.test.mjs`
- E2E verification 2026-08-02: claw-kit 插件可用性测试 20260802, marker `CLAW-KIT-E2E-20260802-OK`

<!-- state: history -->
## Evolution history

<!-- dated: 2026-11-07 -->
### Startup skill preparation uses plugin-owned delivery

The former advisory-status and explicit-install flow was replaced in claw-kit source by one private preparation request at resident plugin startup. It uses existing Node and notification capabilities; failures do not gate workflow. The implementation does not depend on a new Cindy Host API, promise marketplace install-window completion, or guarantee existing-session hot reload. Focused source/artifact regressions and a temporary-home probe against published shared package 0.2.65 were reported, but the new adapter was not published and actual Cindy session loading remains unverified.

## Search terms

- `Cindy workflow route`
- `Ghost call_tool second-level dispatch`
- `list_tools category knowledge`
- `knowledge.claim`
- `knowledge.done`
- `Cindy CLI PATH resolution`
- `Cindy shared skills startup preparation`
- `CLAW-KIT-E2E-20260802-OK`
