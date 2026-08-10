# Cindy workflow route

## Status

Current

<!-- state: current -->
## Current behavior

- The claw-kit Cindy plugin (`claw-kit` ghost, version `0.2.15.1`) exposes exactly two top-level tools: `list_tools` and `call_tool`. All workflow operations are second-level dispatch: the caller calls `call_tool` with `name` and `args`, and the plugin resolves the operation from its declared categories.
- The plugin workflow category exposes `plan.create`, `plan.start`, task mutations such as `task.done`, `plan.done`, and the knowledge operations `knowledge.claim` / `knowledge.done`. Plan state is canonical in the `.claw` project `plan.json`; the Cindy card is a projection of that store.
- The normal Cindy `plan.create` catalog does not expose a `scope` argument. Templates control plan content, not storage scope: a new plan is project-scoped unless the caller explicitly selects `--scope session`; a retained session manifest may resume an existing session workflow but cannot silently redirect a new project plan.
- A new plan created in a Cindy session starts in `process.discussing`; execution advances with `plan.start`, and a completed plan reaches `end.completed`.
- When a completed task declares no `onDone` choices, passing a `choice` argument is rejected by validation. That rejection is expected behavior of the schema check, not a workflow failure.
- Knowledge finalization in the Cindy host runs through `knowledge.claim` followed by exactly one `knowledge.done` with the `claimToken`, `finalizeId`, and a terminal `status`. Before claim preparation, the plugin waits a fixed ten seconds for the originating `knowledgeDispatch` record to persist, then captures successful `task.done` conclusions from the job's `reportCapture.startedAt` through the next plan-create boundary; it writes that capture atomically before issuing the claim token.
- A `knowledgeDispatch` authorizes its Cindy Worker to execute that finalizer. The Worker validates the dispatched `finalizeId` and preserves real capture/claim failures, but does not re-decide eligibility from persisted `job.host` or `writer.executionPolicy` snapshots.
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

## Search terms

- `Cindy workflow route`
- `Ghost call_tool second-level dispatch`
- `list_tools category knowledge`
- `knowledge.claim`
- `knowledge.done`
- `CLAW-KIT-E2E-20260802-OK`
