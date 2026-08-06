# Cindy workflow route

## Status

Current

<!-- state: current -->
## Current behavior

- The claw-kit Cindy plugin (`claw-kit` ghost, version `0.2.8.2`) exposes exactly two top-level tools: `list_tools` and `call_tool`. All workflow operations are second-level dispatch: the caller calls `call_tool` with `name` and `args`, and the plugin resolves the operation from its declared categories.
- The plugin workflow category exposes `plan.create`, `plan.start`, task mutations such as `task.done`, `plan.done`, and the knowledge operations `knowledge.claim` / `knowledge.done`. Plan state is canonical in the `.claw` project `plan.json`; the Cindy card is a projection of that store.
- A new plan created in a Cindy session starts in `process.discussing`; execution advances with `plan.start`, and a completed plan reaches `end.completed`.
- When a completed task declares no `onDone` choices, passing a `choice` argument is rejected by validation. That rejection is expected behavior of the schema check, not a workflow failure.
- Knowledge finalization in the Cindy host runs through `knowledge.claim` (atomic capture of the originating task conclusions before issuing a claim token) followed by exactly one `knowledge.done` with the `claimToken`, `finalizeId`, and a terminal `status`.
- Cindy preserves the CLI's original `workflowGuidance.nextsteps` in every workflow result. Its `guidance` object is only an additive local execution mapping and may not filter or replace shared nextsteps, including the required dispatch instruction for a terminal `knowledgeDispatch`.
- The plugin exposes an unprivileged project-configuration explanation through `ghost.json` `settingsHtml: "panel.html"`, Cindy's supported plugin detail-page configuration surface; it does not declare an unsupported `panel` slot.
- The page documents the only two configuration layers: team-owned `.claw/project.json` and gitignored personal `.claw/project-override.json`. It does not read or write configuration, maintain a second store, or use Cindy Host APIs.

## Implementation and verification anchors

- `packages/cindy-adapter/plugin/ghost.json` (tool surface and `0.2.8.2` version)
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
