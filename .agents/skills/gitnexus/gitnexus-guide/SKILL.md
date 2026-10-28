---
name: gitnexus-guide
description: "Use when the user asks about GitNexus itself — available tools, how to query the knowledge graph, MCP resources, graph schema, or workflow reference. Examples: \"What GitNexus tools are available?\", \"How do I use GitNexus?\""
---

# GitNexus Guide

Quick reference for all GitNexus MCP tools, resources, and the knowledge graph schema.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` and run `npx -y <resolved-cli-spec> analyze`.

## Skills

| Task                                         | Skill to read       |
| -------------------------------------------- | ------------------- |
| Understand architecture / "How does X work?" | `gitnexus-exploring`         |
| Blast radius / "What breaks if I change X?"  | `gitnexus-impact-analysis`   |
| Trace bugs / "Why is X failing?"             | `gitnexus-debugging`         |
| Rename / extract / split / refactor          | `gitnexus-refactoring`       |
| Tools, resources, schema reference           | `gitnexus-guide` (this file) |
| Index, status, clean, wiki CLI commands      | `gitnexus-cli`               |
| Create Unity analyze_rules interactively     | `gitnexus-unity-rule-gen`    |

## Tools Reference

| Tool             | What it gives you                                                        |
| ---------------- | ------------------------------------------------------------------------ |
| `query`          | Process-grouped code intelligence — execution flows related to a concept |
| `context`        | 360-degree symbol view — categorized refs, processes it participates in  |
| `impact`         | Symbol blast radius — what breaks at depth 1/2/3 with confidence         |
| `detect_changes` | Git-diff impact — what do your current changes affect                    |
| `rename`         | Multi-file coordinated rename with confidence-tagged edits               |
| `unity_ui_trace` | Unity UI query-time evidence chains (`asset_refs/template_refs/selector_bindings`) |
| `cypher`         | Raw graph queries (read `gitnexus://repo/{name}/schema` first)           |
| `list_repos`     | Discover indexed repos                                                   |

### Query and context inputs

Use `query({search_query: "concept"})`; the handler also accepts legacy `query` callers. Use `context({name: "symbol", file_path: "src/file", kind: "Method"})` to narrow same-name candidates, or `uid` for a direct lookup. Optional `branch` selects a pinned branch index.

Search can return `warning` and `partial` when FTS or enrichment is degraded. These fields remain visible in slim output; absence of a match during degradation is not proof that the code does not exist. `contentAvailability` explains whether requested source content is retained in the index.

### Unity Retrieval Contract (query/context)

Default `query/context` responses are now slim for agent use:

- `query`: `summary`, `candidates`, `process_hints`, `resource_hints`, `resource_chains`, `decision`, `missing_proof_targets`, `suggested_context_targets`, `upgrade_hints`, `runtime_preview`
- `context`: `summary`, `symbol`, `incoming`, `outgoing`, `processes`, `resource_hints`, `resource_chains`, `verification_hint`, `missing_proof_targets`, `suggested_context_targets`, `upgrade_hints`, `runtime_preview`
- `suggested_context_targets[]` now returns structured objects: `{ name, uid?, filePath?, why }`
- `upgrade_hints[]` may include exact `gitnexus context --uid <uid>` commands for same-name disambiguation
- `resource_chains[]` returns graph-backed Unity seed chains such as `sourceResourcePath -> intermediateResourcePath -> targetSymbol` when a resource seed can be bridged through `UNITY_ASSET_GUID_REF -> UNITY_GRAPH_NODE_SCRIPT_REF`.

When you need the legacy heavy payloads (`processes`, `process_symbols`, `definitions`, `resourceBindings`, `serializedFields`, `next_hops`), pass:

- `response_profile: "full"` in MCP calls
- `--response-profile full` in CLI calls

When you need Unity resource evidence, pass:

- `unity_resources: "on"` (or `"auto"` when you want adaptive behavior)
- `unity_hydration_mode: "compact" | "parity"` (default: `"compact"`)

Recommended default workflow:

1. Follow `discovery -> seed narrowing -> closure verification`.
2. Call `context/query` with `unity_hydration_mode: "compact"` for speed.
3. Inspect `hydrationMeta` in the response:
   - `needsParityRetry: true` → rerun same call with `unity_hydration_mode: "parity"`
   - `isComplete: true` → keep compact result
4. Treat parity as the completeness path for advanced verification.

Agent-safe upgrade path:

- inspect `resource_chains[]` first for graph-backed Unity resource bridges, then `resource_hints[]` / `process_hints[]` and narrow with `resource_path_prefix=` or symbol-targeted context
- use `decision.recommended_follow_up` as the default narrow-first next step
- inspect `missing_proof_targets[]` and structured `suggested_context_targets[]` before considering payload expansion
- when `suggested_context_targets[]` includes `uid`, prefer the matching `upgrade_hints[]` `context --uid` command over same-name `context(name=...)`
- `response_profile=slim` is the default and sufficient for normal workflows
- use `response_profile: "full"` only for debugging/deep evidence inspection when narrowing cannot close the proof gap

Runtime claim closure reminder:

- Query-time runtime closure is **graph-only** and does not require `verification_rules` / `trigger_tokens` matching.
- `verification_rules` remains an offline governance/report artifact family.
- Strong graph hops can coexist with failed closure when verifier-core stays `failed`; report as partial bridge evidence.
- `gitnexus-unity-rule-gen` public flow is `approved -> compile -> analyze -> CLI validation`; this does not change query-time graph-only closure semantics.
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, rerun parity before closure claims.

When task scope includes Unity runtime process semantics, load and follow:

- `_shared/unity-runtime-process-contract.md`

### Unity UI Trace Contract (`unity_ui_trace` / `gitnexus unity-ui-trace`)

Input:
- `target`: C# class 名或 UXML 路径
- `goal`: `asset_refs | template_refs | selector_bindings`
- `selector_mode`（可选）: `balanced`（默认）或 `strict`

Modes:
- `balanced`: 复合选择器 token 匹配，召回优先
- `strict`: 仅精确 `.className` 选择器，精度优先

Output:
- `results[].evidence_chain`: 严格 `path + line + snippet` 证据跳
- `results[].score`: 排序分数（高分优先）
- `results[].confidence`: `high|medium|low`
- `diagnostics`: `not_found|ambiguous`

Recommended workflow:
1. 先跑 `asset_refs`（确认资源引用链存在）
2. 再跑 `template_refs`（确认模板引用链存在）
3. 最后跑 `selector_bindings`（先 `balanced`，必要时切 `strict` 验证）

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource                                       | Content                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `gitnexus://repo/{name}/context`               | Stats, staleness check                    |
| `gitnexus://repo/{name}/clusters`              | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members                              |
| `gitnexus://repo/{name}/processes`             | All execution flows                       |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace                        |
| `gitnexus://repo/{name}/schema`                | Graph schema for Cypher                   |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS
**Unity edges:** UNITY_ASSET_GUID_REF (serialized field → asset), UNITY_COMPONENT_INSTANCE (class → asset file)

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

## Runtime-Chain Closure Guard

- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.


## Upstream tool and schema additions

| Tool             | What it gives you                                                        |
| ---------------- | ------------------------------------------------------------------------ |
| `query`          | Process-grouped code intelligence — execution flows related to a concept |
| `context`        | 360-degree symbol view — categorized refs, processes it participates in  |
| `impact`         | Symbol blast radius — what breaks at depth 1/2/3 with confidence         |
| `trace`          | Shortest path between two symbols — "how does A reach B?" in one call     |
| `detect_changes` | Git-diff impact — what do your current changes affect                    |
| `rename`         | Multi-file coordinated rename with confidence-tagged edits               |
| `cypher`         | Raw graph queries (read `gitnexus://repo/{name}/schema` first)           |
| `explain`        | Persisted taint findings — source→sink data flows (needs `analyze --pdg`) |
| `pdg_query`      | Control/data dependence — what gates X (CDG) / where Y flows (REACHING_DEF); needs `analyze --pdg` |
| `check`          | Check graph invariants such as circular imports                          |
| `route_map`      | API route map — which components/hooks fetch which endpoints, and the handler files that serve them |
| `shape_check`    | Response-shape drift — keys each route returns vs keys its consumers access (flags MISMATCH) |
| `api_impact`     | Pre-change report for an API route — consumers, middleware, shape mismatches, risk level |
| `tool_map`       | MCP/RPC tool definitions and the files that handle them                  |
| `group_list`     | List configured multi-repo groups, or one group's config                 |
| `group_sync`     | Rebuild a group's Contract Registry (cross-repo HTTP contract links); run after `group.yaml` changes or member re-index |
| `list_repos`     | Discover indexed repos (paginated — `limit`/`offset`)                    |

### Paginating `list_repos`

`list_repos` is paginated so a large registry is not truncated by MCP/LLM token limits. It takes optional `limit` (default **50**, max **200**) and `offset`, and returns:

```jsonc
{
  "repositories": [
    { "name": "...", "path": "...", "indexedAt": "...", "lastCommit": "...", "stats": { } }
  ],
  "pagination": {
    "total": 437,
    "limit": 50,
    "offset": 0,
    "returned": 50,
    "hasMore": true,
    "nextOffset": 50
  }
}
```

To enumerate **every** repository, keep calling with `offset` set to `pagination.nextOffset` until `hasMore` is `false`:

```text
list_repos {}               → repos 1–50,    nextOffset 50,  hasMore true
list_repos { offset: 50 }   → repos 51–100,  nextOffset 100, hasMore true
…
list_repos { offset: 400 }  → repos 401–437,                 hasMore false   (done)
```

Notes: `offset` ≥ `total` returns an empty page (with `total` still reported). Out-of-range or malformed `limit`/`offset` (non-integer, `limit` outside `[1, 200]`, `offset < 0`) are rejected with a clear error — `limit` above the max is rejected, not silently capped. The order is deterministic (lower-cased name, then path), so paging never skips or duplicates an entry while the registry is unchanged.

### Inline staleness signal (`query` / `context` / `impact` / `cypher`)

These four hot read tools attach a non-blocking `staleness` field to their response when the index is not at the checkout's current HEAD — the same `{ status, commitsBehind?, hint? }` shape `list_repos` already reports — so a direct tool call surfaces a stale index without a separate `list_repos` call:

```jsonc
{ /* …the tool's normal result… */
  "staleness": { "status": "behind", "commitsBehind": 3, "hint": "⚠️ Index is 3 commits behind HEAD. Run analyze tool to update." }
}
```

`commitsBehind` is present only when git counted the gap. When git could not count it but HEAD still resolves to a commit other than the indexed one — usually because the indexed commit is no longer in the clone's history — the index is provably not at HEAD with no countable gap, so no number is reported:

```jsonc
{ /* …the tool's normal result… */
  "staleness": { "status": "diverged", "hint": "⚠️ Index is not at HEAD and the commit gap could not be counted — the recorded commit may no longer be in this clone's history. Run analyze tool to update." }
}
```

The field is **absent when the index is current**, and these four tools also omit it when the freshness check could not run at all — that case is `status: "unknown"`, which only the `list_repos` listing reports. So its presence means the status is not `current`: read `status` before using `commitsBehind`. It is only ever added to object results — raw-array `cypher` output and error envelopes are returned unchanged. `@group`-targeted calls do not carry it (multi-repo staleness is ill-defined). When you see it, the graph may be behind the working tree — re-run `analyze` before trusting blast-radius or dependence answers.

### Taint findings (`explain`)

`explain` returns taint findings recorded by `gitnexus analyze --pdg` — intra-procedural `TAINTED` edges plus cross-function `TAINT_PATH` hops where the interprocedural taint phase found a function-level source→sink chain. Each finding includes a sink category (command-injection, code-injection, path-traversal, sql-injection, xss), source/sink lines, and the ordered hop path with the variable carried on each hop.

- `explain {}` — enumerate all findings for the repo (bounded by `limit`, deterministic order)
- `explain { target: "src/vuln.ts" }` — findings in a file (suffix path match accepted)
- `explain { target: "runUserCommand" }` — findings in a function (resolved like `context`; ambiguous names return ranked candidates)

A repo indexed without `--pdg` returns a clear "no taint layer" note. Caveats: closure/callback, property/field, and implicit flows are not modeled, and interprocedural findings are function-level `TAINT_PATH` hops rather than statement-level path proof, so the absence of a finding is **not** proof of safety. `SANITIZES` (sanitizer-kill) edges are queryable via `cypher`.

### Control & data dependence (`pdg_query`)

`pdg_query` reads the control/data-dependence layers `gitnexus analyze --pdg` records (CDG + REACHING_DEF, basic-block granular) — the control/data analog of `explain`. It is **always anchored** (a `target` file path or symbol, resolved like `context`) and has two modes:

- `pdg_query { mode: "controls", target: "..." }` — CDG: "under what condition does X run?". Each edge is a controlling predicate block → dependent block with the branch sense (`'T'`/`'F'`) in `reason`; an edge into an early `return`/`throw` is flagged `guard: true` (guard-clause discovery — the sense depends on the predicate, so don't filter guards by a fixed label).
- `pdg_query { mode: "flows", target: "...", variable?: "..." }` — REACHING_DEF def→use edges within the function; pass `variable` to trace one binding.

A repo indexed without `--pdg` returns a "no PDG layer" note (or "status unknown" when the layer can't be confirmed). Intra-procedural only — cross-function flow is taint's domain (`explain`). The raw CDG/REACHING_DEF edges are also queryable via `cypher`. See the `gitnexus-pdg-query` skill for the full query surface.

### Shortest path between two symbols (`trace`)

`trace` answers "how does A reach B?" in one call — the shortest directed path over `CALLS` (plus `HAS_METHOD`, so a class-rooted trace descends into its methods) instead of chaining 3–8 `context`/`impact` hops by hand.

- `trace { from: "validateUser", to: "executeQuery" }` — shortest path between two symbols.
- Disambiguate common names with `from_uid`/`to_uid` (zero-ambiguity) or `from_file`/`to_file`; an ambiguous name returns ranked candidates.
- `maxDepth` (default 10, max 30) bounds the search; `includeTests` (default false) lets the traversal pass through test-file symbols.

Returns ordered `hops` (each `{ name, filePath, startLine }`) and an aligned `edges[]` of `{ relType, confidence }`, so call hops and containment (`HAS_METHOD`) hops stay distinguishable. When no path exists it reports the **furthest** reachable node (where the chain breaks) and sets `truncated: true` if a traversal cap was hit first. Every result carries a `status`: `ok` / `no_path` / `ambiguous` / `not_found` / `error`.

Cross-repo (experimental): pass `repo: "@groupName"` to trace across a group's member repos — the path may cross **one** `ContractLink` boundary (reported as a `CONTRACT_LINK` hop with the bridged contract in `crossings[]`). Omit `to` entirely to follow `from`'s outgoing HTTP call to whatever provider endpoint it lands on. Groups are configured via `group_list` / `group_sync`.

Read `gitnexus://repo/{name}/schema` before writing Cypher. Fork Unity tools and narrowing-first slim/full rules above remain available.
