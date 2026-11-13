# DSH knowledge dispatch and finalization

<!-- state: current -->
## Current behavior

DSH is a first-class claw invocation host. For newly completed project plans with capture enabled, Core emits a versioned source-plan handoff containing the originating session key, complete plan path/title, project root, and writer preferences. DSH adapter dispatches that handoff to its `subagents` worker route. Since DSH 0.2.2-rc.2 the launch uses the flattened activation request (top-level `parent`/`prompt`/`agentOptions`) with explicit `delivery: "caller"` and a signal; `agentTeams` owns no member or message operation. This source route does not create a claimable knowledge job and does not require claim, token, authenticated receipt, or a separate knowledge.done transition; ordinary non-capturing plan/subplan completion is the writer's completion boundary.

The writer calls the native `claw_run` `knowledge.materials` operation with the source session key and source plan path. Core reads the complete source plan and creates disposable ordinary writer templates; DSH reads originating-session history through its host API and writes available ordinary user/assistant text to the material report. Extraction excludes non-text/tool/reasoning records, applies source-plan time bounds and nearest preceding user context, and deduplicates message IDs. Unavailable history is reported as unavailable, not represented as an empty transcript. Source plan is read-only evidence. The writer follows ordinary workflow guidance, including an auxiliary plan with knowledge capture disabled and its governance subplan.

Implementation anchors: `packages/cli/src/command-service.ts`, `packages/cli/src/knowledge-dispatch.ts`, `packages/cli/src/knowledge-materials.ts`, `packages/dsh-adapter/src/index.ts`, `packages/dsh-adapter/src/capture.ts`, and `packages/dsh-adapter/src/protocol.ts`. The built-in governance minimum format is `packages/core/resources/knowledge-writer/knowledge-format.md`.

The older claim-based job lifecycle remains available for explicitly invoked legacy jobs and other routes that still use it; it is not the new DSH source-plan handoff. Old jobs are not automatically replayed, migrated, or rewritten. DSH native adapter changes require matching CLI/Core protocol; source checks do not prove an installed host has loaded them.

## Operational boundaries

- Adapter owns host identity and originating history access; the worker session is distinct from the source session key used only as a read target.
- A source path must resolve within the project's task directory. Missing/unreadable materials remain visible as errors or unavailable evidence; do not fabricate completeness.
- Dispatch is not proof that document changes occurred. Report changed documents, supported no-edit conclusions, or unfinished work from the ordinary plan outcome.
- Legacy claim/receipt APIs and their safety contracts remain compatibility behavior, not prerequisites for the new source route.

## Related code and verification

- `packages/cli/src/command-service.ts` (source handoff: 1000-1025)
- `packages/cli/src/knowledge-dispatch.ts` (lines 8-30)
- `packages/cli/src/knowledge-materials.ts` (lines 13-81)
- `packages/dsh-adapter/src/index.ts` (lines 489-501)
- `packages/dsh-adapter/src/capture.ts`
- `packages/dsh-adapter/src/protocol.ts` (lines 242-244)

Focused regression coverage includes `packages/dsh-adapter/test/finalizer-execute.test.mjs` and `packages/cli/test/source-knowledge.test.ts`. These tests do not establish live-host deployment or production finalizer E2E. The 2026-11-13 checkpoint records one live rc.2 writer launch and material read; that is session-bound evidence, not a general deployment or every-provider claim.

<!-- state: history -->
## Evolution history

<!-- dated: 2026-11-13 -->
### rc.2 launch shape and carrier

`startActivation` no longer accepts a nested `request`; it takes flat `parent`/`prompt`/`agentOptions` plus required `delivery` and `signal`. The finalizer passes `delivery: "caller"` so a background writer does not notify the parent model. Dispatch deduplication, no-resend-after-unknown and source-material boundaries are unchanged. This checkpoint was first verified offline against the published rc.2 SDK shape. A later live rc.2 session closed a capture-enabled plan: `plan.done` dispatched a real writer, and that worker read the complete source plan and available conversation through `knowledge.materials`. That is live launch and material-handoff evidence for this route, not a claim about writer document outcomes, which the writer's own ordinary plan reports.

<!-- dated: 2026-10-29 -->
### Source-plan handoff replaced claim protocol for DSH's new route

The new DSH source-plan route supplies the originating session key and complete plan as material coordinates, then uses ordinary non-capturing plan/subplan workflow. It does not create a new claim job or rely on token/done/receipt. The older claim-based process remains only for explicitly invoked legacy work; it is not automatically migrated or replayed.

<!-- dated: 2026-10-22 -->
### Windows DSH 0.2.63 and 0.2.50 smokes (historical)

A Windows session on 0.2.63 reported successful core workflow operations for that frozen candidate only, while the earlier 0.2.50 session exercised core plan/task lifecycle without post-plan knowledge finalization. Neither establishes later finalizer behavior or current installation state, and neither is evidence for the present source-plan route.

<!-- dated: 2026-10-03 -->
### Cross-host execute-first beta verification (historical)

Evidence applies only to the then-frozen batch and exercised paths, not current artifacts or live Codex hosting.

<!-- dated: 2026-10-02 -->
### Native-only dispatch compatibility baseline (historical)

The prior route used claimable jobs and native child de-duplication. It remains relevant to legacy-job diagnosis only; it does not describe the new source-plan handoff.

<!-- dated: 2026-08-22 -->
### Earlier claim-time capture route (historical)

Prior DSH versions captured task conclusions during claim and required token-protected completion. Those semantics are superseded for new DSH source-plan handoffs.
