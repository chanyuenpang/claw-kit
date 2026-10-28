---
name: gitnexus-debugging
description: "Use when the user is debugging a bug, tracing an error, or asking why something fails. Examples: \"Why is X failing?\", \"Where does this error come from?\", \"Trace this bug\""
---

# Debugging with GitNexus

## When to Use

- "Why is this function failing?"
- "Trace where this error comes from"
- "Who calls this method?"
- "This endpoint returns 500"
- Investigating bugs, errors, or unexpected behavior

## Workflow

```
1. gitnexus_query({query: "<error or symptom>"})            → Find related execution flows
2. gitnexus_context({name: "<suspect>"})                    → See callers/callees/processes
3. (Unity symbols) use unity_resources + hydration contract
4. READ gitnexus://repo/{name}/process/{name}                → Trace execution flow
5. gitnexus_cypher({query: "MATCH path..."})                 → Custom traces if needed
```

> If "Index is stale" → run `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` and run `npx -y <resolved-cli-spec> analyze`.

## Checklist

```
- [ ] Understand the symptom (error message, unexpected behavior)
- [ ] gitnexus_query for error text or related code
- [ ] Identify the suspect function from returned processes
- [ ] gitnexus_context to see callers and callees
- [ ] For Unity retrieval, start with `unity_hydration_mode: "compact"` and inspect `hydrationMeta`
- [ ] If `hydrationMeta.needsParityRetry === true`, rerun with `unity_hydration_mode: "parity"` before concluding root cause
- [ ] Trace execution flow via process resource if applicable
- [ ] gitnexus_cypher for custom call chain traces if needed
- [ ] Read source files to confirm root cause
```

## Unity Runtime Process Trigger

When debugging involves Unity runtime process semantics (runtime chain confidence, process closure certainty, lifecycle/loader stitching), load and follow:

- `_shared/unity-runtime-process-contract.md`

## Debugging Patterns

| Symptom              | GitNexus Approach                                          |
| -------------------- | ---------------------------------------------------------- |
| Error message        | `gitnexus_query` for error text → `context` on throw sites |
| Wrong return value   | `context` on the function → trace callees for data flow    |
| Intermittent failure | `context` → look for external calls, async deps            |
| Performance issue    | `context` → find symbols with many callers (hot paths)     |
| Recent regression    | `detect_changes` to see what your changes affect           |

## Tools

**gitnexus_query** — find code related to error:

```
gitnexus_query({query: "payment validation error"})
→ Processes: CheckoutFlow, ErrorHandling
→ Symbols: validatePayment, handlePaymentError, PaymentException
```

**gitnexus_context** — full context for a suspect:

```
gitnexus_context({name: "validatePayment"})
→ Incoming calls: processCheckout, webhookHandler
→ Outgoing calls: verifyCard, fetchRates (external API!)
→ Processes: CheckoutFlow (step 3/7)
```

**Unity debug retrieval** — explicit completeness control:

```
gitnexus_context({
  name: "DoorObj",
  unity_resources: "on",
  unity_hydration_mode: "compact"
})
→ if hydrationMeta.needsParityRetry then rerun with unity_hydration_mode: "parity"
```

**gitnexus_cypher** — custom call chain traces:

```cypher
MATCH path = (a)-[:CodeRelation {type: 'CALLS'}*1..2]->(b:Function {name: "validatePayment"})
RETURN [n IN nodes(path) | n.name] AS chain
```

## Example: "Payment endpoint returns 500 intermittently"

```
1. gitnexus_query({query: "payment error handling"})
   → Processes: CheckoutFlow, ErrorHandling
   → Symbols: validatePayment, handlePaymentError

2. gitnexus_context({name: "validatePayment"})
   → Outgoing calls: verifyCard, fetchRates (external API!)

3. READ gitnexus://repo/my-app/process/CheckoutFlow
   → Step 3: validatePayment → calls fetchRates (external)

4. Root cause: fetchRates calls external API without proper timeout
```

## Runtime-Chain Closure Guard

- Query-time runtime closure is **graph-only** and does not require `verification_rules` / `trigger_tokens` matching.
- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.


## Repository identity

Use `list_repos {}` to inspect registered repositories. Follow `offset: pagination.nextOffset` until `hasMore` is false when you need the complete list. Bind subsequent calls explicitly, for example `repo: "my-app"`, when working across repositories. Read-only tools may infer the registered path containing the process cwd, but must not cross an unindexed nested Git checkout. If no sole/default/cwd match exists, resolve the ambiguity before proceeding. For a linked checkout, pass `worktree` to `detect_changes` so its diff comes from the edited checkout.
