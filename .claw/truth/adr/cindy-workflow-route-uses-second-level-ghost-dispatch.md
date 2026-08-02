# ADR: Cindy workflow route uses second-level Ghost dispatch

## Status

Accepted

## Context

The claw-kit Cindy plugin exposes only `list_tools` and `call_tool` at the top level, so Cindy sessions cannot invoke workflow operations such as `plan.start`, `task.done`, or `knowledge.claim` directly. The routing contract must stay explicit so agents and the plugin agree on how an operation name maps to a tool call and where canonical state lives.

## Decision

- All claw workflow operations in the Cindy host are second-level dispatch through `call_tool` with `name` and `args`; operation names are resolved from the categories returned by `list_tools`.
- `list_tools` with a category is the discovery surface for operation names and argument schemas; `call_tool` is the single execution entry.
- Plan state remains canonical in `.claw` `plan.json`; the Cindy Ghost progress card is a presentation projection and never becomes a second plan store.
- Knowledge finalization uses the plugin's own claim/done protocol: `knowledge.claim` atomically freezes the originating task conclusions, then exactly one `knowledge.done` completes the job with the returned `claimToken`.

## Consequences

- Agents running in Cindy must resolve operation names through `list_tools` before calling `call_tool`, and must not treat a second-level operation name as a top-level tool.
- A completed task with no declared `onDone` choices rejects a passed `choice` argument; callers omit `choice` in that case instead of treating the rejection as a workflow failure.
- The route contract is verified end-to-end on claw-kit plugin `0.2.7.1` (marker `CLAW-KIT-E2E-20260802-OK`).

## Related code

- `packages/cindy-adapter/plugin/ghost.json`
- `packages/cindy-adapter/plugin/main.js`
- `packages/cindy-adapter/plugin/node/claw-worker.cjs`

## Search terms

- `Cindy second-level dispatch`
- `call_tool name args`
- `knowledge.claim`
- `knowledge.done claimToken`
- `CLAW-KIT-E2E-20260802-OK`
