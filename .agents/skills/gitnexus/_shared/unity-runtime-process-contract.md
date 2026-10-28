# Unity Runtime Process Contract

Use this contract when analysis touches Unity runtime process semantics (runtime chain, lifecycle/loader stitching, or confidence-based closure).

## Trigger Conditions

Load this contract when any of the following is true:

- Query/debug/impact/refactor task requires Unity runtime process closure.
- Result contains Unity process evidence with `confidence` interpretation.
- Result has empty `processes` but Unity resource evidence is present.
- User asks for runtime-chain verification quality or closure certainty.

## Required Workflow

Use this order: `discovery -> seed narrowing -> closure verification`.

1. Run `query/context` with `unity_resources: "on"` and `unity_hydration_mode: "compact"` first.
   - For `response_profile=slim`, read semantic tiers in order: `facts -> closure -> clues`.
   - In strict-anchor mode, never let `clues` become the first-screen default when `facts` has high/medium leads.
2. If `hydrationMeta.needsParityRetry === true`, rerun with `unity_hydration_mode: "parity"` before conclusions.
3. Do not conclude "no runtime chain" from empty `processes` alone.
4. If Unity evidence exists, continue stitching:
   - `processes`
   - `resource_chains` for graph-backed `UNITY_ASSET_GUID_REF -> UNITY_GRAPH_NODE_SCRIPT_REF` bridges
   - `resourceBindings`
   - asset/meta mapping anchors
   - runtime candidate symbols
5. Treat low-confidence rows as unresolved unless `verification_hint` includes:
   - `action`
   - `target`
   - `next_command`
6. Semantic closure requires hop anchors/evidence anchors for each stitched step.
7. Treat `clues` as narrowing evidence (`clue`) and never as standalone closure proof.
8. Strong graph hops can coexist with failed closure; report as partial bridge evidence until verifier-core reaches `verified_full`.

## Optional Strong Verification

For Reload-focused confirmation, request on-demand verification:

- pass `runtime_chain_verify: "on-demand"` in MCP tools, or
- use CLI `--runtime-chain-verify on-demand`.
- `queryText` is not a verifier matching signal in graph-only mode; use structured anchors/resource evidence for closure.

When on-demand verification is used, report `runtime_chain.status`, `evidence_level`, `hops`, and `gaps` before final risk/closure statements.


## Runtime-Chain Closure Guard

- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.

## Analyze-time lifecycle sampling

`unity-lifecycle` keeps the 256 synthetic-root entry cap and the per-class cap. It admits hosts by callback-count group; only the group crossing the cap is ranked by trusted CALLS value (two-hop continuations, then direct calls), with stable identity ties. Available slots first cover hosts without an existing synthetic root entry, then fill by callback value. The phase reports truncated callbacks, hosts still uncovered after injection, and selected callbacks without trusted calls across all groups. Entry value predicts useful traces but does not prove persisted Process membership.

A dedicated `unity-processes` phase preserves generic processes and adds bounded traces with an independent budget per lifecycle callback (up to 256 callbacks, 48 candidates and 4096 queued states per callback, four outgoing branches per step, ten steps). It deduplicates complete ordered traces, uses real lifecycle CALLS, excludes heuristic/low-confidence calls, and reports truncation for every budget. There is no eight-process completion target. Generic `process-processor` stays upstream-compatible. Coverage regression checks compare callback, terminal, and ordered STEP_IN_PROCESS members after reconciling symbol identities; counts or surviving CALLS alone cannot establish parity. Bounded sampling is not verifier-core closure; use graph anchors and on-demand verification for closure.

## Analyze freshness and resource integrity

`unityInputReceipt` certifies a successful content-validated Unity analysis, not
runtime closure. An unchanged dirty worktree may reuse that index. Changed
inputs or a legacy missing receipt require a full staged rebuild; parser cache
can still be reused. On `Unity input-failure`, resolve the read/version problem
and rerun. Compare persisted resource relationships and ordered process members
when validating a rebuild: matching counts or parity seed alone is insufficient.
