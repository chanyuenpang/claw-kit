---
name: gitnexus-exploring
description: "Use when the user asks how code works, wants to understand architecture, trace execution flows, or explore unfamiliar parts of the codebase. Examples: \"How does X work?\", \"What calls this function?\", \"Show me the auth flow\""
---

# Exploring Codebases with GitNexus

## When to Use

- "How does authentication work?"
- "What's the project structure?"
- "Show me the main components"
- "Where is the database logic?"
- Understanding code you haven't seen before

## Workflow

```
1. (Repo unknown / multi-repo only) READ gitnexus://repos     → Discover indexed repos
2. READ gitnexus://repo/{name}/context                        → Codebase overview, check staleness
3. gitnexus_query({query: "<what you want to understand>"})   → Find related execution flows
4. Narrow with slim hints first                               → `decision.recommended_follow_up`, `missing_proof_targets`, `suggested_context_targets`
5. gitnexus_context({name|uid: "<symbol>"})                   → Deep dive on specific symbol
6. (Unity symbols) rerun context/query with unity params when needed
7. READ gitnexus://repo/{name}/process/{name} or use cypher   → Trace full execution flow or prove a structure
```

Runtime retrieval mnemonic: `discovery -> seed narrowing -> closure verification`.

Unity runtime retrieval rule of thumb:

- natural-language `query` is discovery-only;
- do not treat it as the primary retrieval anchor;
- once you have a symbol or resource seed, switch to `uid` / `resource_path_prefix` narrowing immediately.

> If step 2 says "Index is stale" → run `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` (`cliPackageSpec` first, then `cliVersion`) and run `npx -y <resolved-spec> analyze` (repository defaults come from `.gitnexusrc`; explicit CLI flags override them). If the user declines, explicitly warn that retrieval may not reflect the current codebase.

## Checklist

```
- [ ] READ gitnexus://repo/{name}/context
- [ ] Only use `gitnexus://repos` / `list_repos` when the target repo is unknown or multiple repos are indexed
- [ ] gitnexus_query for the concept you want to understand
- [ ] Review slim query fields first: `summary`, `candidates`, `process_hints`, `resource_hints`, `resource_chains`, `decision`, `missing_proof_targets`, `suggested_context_targets`, `upgrade_hints`, `runtime_preview`
- [ ] Prefer narrowing with `decision.recommended_follow_up` and exact `uid`-based context before expanding payload size
- [ ] gitnexus_context on key symbols for callers/callees
- [ ] Review slim context fields first: `summary`, `symbol`, `incoming`, `outgoing`, `processes`, `resource_hints`, `resource_chains`, `verification_hint`, `missing_proof_targets`, `suggested_context_targets`, `upgrade_hints`, `runtime_preview`
- [ ] If you need legacy heavy fields (`processes`, `process_symbols`, `definitions`, `resourceBindings`, `serializedFields`, `next_hops`), rerun with `response_profile: "full"`
- [ ] For Unity evidence, call context/query with `unity_resources: "on"` and `unity_hydration_mode: "compact"`
- [ ] If you need `hydrationMeta.needsParityRetry` or strict fallback diagnostics, rerun with `response_profile: "full"` first
- [ ] If `hydrationMeta.needsParityRetry === true` or `hydrationMeta.fallbackToCompact === true`, rerun with `unity_hydration_mode: "parity"` before closure claims
- [ ] READ process resource for full execution traces
- [ ] Use `cypher` when you need a graph-level proof instead of another exploratory hint
- [ ] Read source files for implementation details
```

## Unity Runtime Process Contract

When exploration touches Unity runtime process semantics (runtime chain closure, lifecycle/loader stitching, confidence-based closure), load and follow:

- `_shared/unity-runtime-process-contract.md`

## Resources

| Resource                                | What you get                                            |
| --------------------------------------- | ------------------------------------------------------- |
| `gitnexus://repo/{name}/context`        | Stats, staleness warning (~150 tokens)                  |
| `gitnexus://repo/{name}/clusters`       | All functional areas with cohesion scores (~300 tokens) |
| `gitnexus://repo/{name}/cluster/{name}` | Area members with file paths (~500 tokens)              |
| `gitnexus://repo/{name}/process/{name}` | Step-by-step execution trace (~200 tokens)              |

## Tools

**gitnexus_query** — find execution flows related to a concept:

```
gitnexus_query({query: "payment processing"})
→ Slim response: summary + candidates + process_hints + resource_hints + resource_chains + decision + missing_proof_targets + suggested_context_targets + upgrade_hints + runtime_preview
→ Use `decision.recommended_follow_up` first; if `suggested_context_targets[]` includes `uid`, prefer the matching `context --uid` upgrade hint
→ Rerun with response_profile: "full" only if you need grouped process rows (`processes`, `process_symbols`, `definitions`, `next_hops`) or full `runtime_claim`
```

**gitnexus_context** — 360-degree view of a symbol:

```
gitnexus_context({name: "validateUser"})
→ Slim response: symbol + incoming/outgoing refs + processes + resource_hints + resource_chains + verification_hint + missing_proof_targets + suggested_context_targets + upgrade_hints + runtime_preview
→ Use structured `suggested_context_targets[]` and `uid` disambiguation before rerunning full
→ Rerun with response_profile: "full" for Unity hydration diagnostics, `next_hops`, `runtime_claim`, or larger categorized ref payloads
```

**Unity-focused context/query** — use compact first, inspect slim hints, then parity/full only when needed:

```
gitnexus_query({
  query: "ReloadBase",
  resource_path_prefix: "Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset",
  unity_resources: "on",
  unity_hydration_mode: "compact"
})
→ Use symbol/resource anchors for Unity runtime retrieval; do not rely on broad natural-language phrasing
→ Slim output gives resource/process narrowing hints first
→ If you need hydration diagnostics, rerun with response_profile: "full"
→ hydrationMeta.needsParityRetry ? rerun with unity_hydration_mode: "parity" : continue
```

Unity runtime example:

```
1. READ gitnexus://repo/neonspark-core/context
2. gitnexus_query({
     query: "ReloadBase",
     resource_path_prefix: "Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset",
     unity_resources: "on",
     unity_hydration_mode: "compact"
   })
3. Follow `decision.recommended_follow_up` immediately
4. gitnexus_context({uid: "<exact uid>", unity_resources: "on", runtime_chain_verify: "on-demand"})
5. READ process resource or use cypher if you need graph proof
```

## Example: "How does payment processing work?"

```
1. READ gitnexus://repo/my-app/context       → 918 symbols, 45 processes
2. gitnexus_query({query: "payment processing"})
   → CheckoutFlow: processPayment → validateCard → chargeStripe
   → RefundFlow: initiateRefund → calculateRefund → processRefund
3. gitnexus_context({name: "processPayment"})
   → Incoming: checkoutHandler, webhookHandler
   → Outgoing: validateCard, chargeStripe, saveTransaction
4. Read src/payments/processor.ts for implementation details
```

## Runtime-Chain Closure Guard

- Query-time runtime closure is **graph-only** and does not require `verification_rules` / `trigger_tokens` matching.
- For Unity runtime retrieval, prefer symbol/resource anchors over business-description phrasing; use natural-language `query` only to discover the first anchor.
- `response_profile=slim` is sufficient for normal workflows; use `runtime_preview` as the default status summary.
- `response_profile=full` is for debugging and deep evidence inspection (`runtime_claim.hops`, `runtime_claim.gaps`, hydration diagnostics).
- Strong graph hops can coexist with failed closure when verifier-core still reports `failed`; this is partial bridge evidence, not contradiction.
- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.


## Repository identity

Use `list_repos {}` to inspect registered repositories. Follow `offset: pagination.nextOffset` until `hasMore` is false when you need the complete list. Bind subsequent calls explicitly, for example `repo: "my-app"`, when working across repositories. Read-only tools may infer the registered path containing the process cwd, but must not cross an unindexed nested Git checkout. If no sole/default/cwd match exists, resolve the ambiguity before proceeding. For a linked checkout, pass `worktree` to `detect_changes` so its diff comes from the edited checkout.
