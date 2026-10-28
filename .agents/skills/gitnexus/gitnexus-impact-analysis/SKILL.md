---
name: gitnexus-impact-analysis
description: "Use when the user wants to know what will break if they change something, or needs safety analysis before editing code. Examples: \"Is it safe to change X?\", \"What depends on this?\", \"What will break?\""
---

# Impact Analysis with GitNexus

## When to Use

- "Is it safe to change this function?"
- "What will break if I modify X?"
- "Show me the blast radius"
- "Who uses this code?"
- Before making non-trivial code changes
- Before committing — to understand what your changes affect

## Workflow

```
1. gitnexus_impact({target: "X", direction: "upstream"})  → What depends on this
2. READ gitnexus://repo/{name}/processes                   → Check affected execution flows
3. gitnexus_detect_changes()                               → Map current git changes to affected flows
4. Assess risk and report to user
```

> If "Index is stale" → run `gitnexus analyze` when local CLI exists; otherwise resolve the pinned npx package spec from `~/.gitnexus/config.json` and run `npx -y <resolved-cli-spec> analyze`.

## Checklist

```
- [ ] gitnexus_impact({target, direction: "upstream"}) to find dependents
- [ ] Review d=1 items first (these WILL BREAK)
- [ ] Check high-confidence (>0.8) dependencies
- [ ] For Unity symbols, verify `context(..., unity_resources: "on")` hydration completeness
- [ ] If compact response has `hydrationMeta.needsParityRetry === true`, rerun in parity before final risk call
- [ ] READ processes to check affected execution flows
- [ ] gitnexus_detect_changes() for pre-commit check
- [ ] Assess risk level and report to user
```

## Unity Runtime Process Trigger

When impact analysis depends on Unity runtime process closure or confidence interpretation, load and follow:

- `_shared/unity-runtime-process-contract.md`

## Understanding Output

| Depth | Risk Level       | Meaning                  |
| ----- | ---------------- | ------------------------ |
| d=1   | **WILL BREAK**   | Direct callers/importers |
| d=2   | LIKELY AFFECTED  | Indirect dependencies    |
| d=3   | MAY NEED TESTING | Transitive effects       |

## Risk Assessment

| Affected                       | Risk     |
| ------------------------------ | -------- |
| <5 symbols, few processes      | LOW      |
| 5-15 symbols, 2-5 processes    | MEDIUM   |
| >15 symbols or many processes  | HIGH     |
| Critical path (auth, payments) | CRITICAL |
| **Zero callers found**         | **UNKNOWN** |

`UNKNOWN` is not a low rung on this scale — it means the walk could not answer.
An empty caller set is equally consistent with "genuinely unused" and "the
callers are not resolvable by the index" (plain-object property access, dynamic
dispatch, cross-language calls), so few-callers ⇒ LOW does **not** apply. The
result carries a `riskNote` saying so. Confirm with a text search before
treating the symbol as safe to change or delete.

`risk` is the edit gate: warn on HIGH/CRITICAL and stop on UNKNOWN until the
uncertainty is resolved. Within single-repo mode, compare File and symbol
targets with local `riskSharedAxes` (direct/total only). Within group mode,
compare only group results: their `riskSharedAxes` overlays resolved
cross-repo crossings on that local value. Never use either field to waive the
edit gate. Check `riskScale.unusedAxes` before comparing kinds: MCP File walks
omit process/module axes, while web Graph-RAG expands File targets to in-file
symbols before enrichment.

## Tools

**gitnexus_impact** — the primary tool for symbol blast radius:

```
gitnexus_impact({
  target: "validateUser",
  direction: "upstream",
  minConfidence: 0.8,
  maxDepth: 3
})

→ d=1 (WILL BREAK):
  - loginHandler (src/auth/login.ts:42) [CALLS, 100%]
  - apiMiddleware (src/api/middleware.ts:15) [CALLS, 100%]

→ d=2 (LIKELY AFFECTED):
  - authRouter (src/routes/auth.ts:22) [CALLS, 95%]
```

**gitnexus_detect_changes** — git-diff based impact analysis:

```
gitnexus_detect_changes({scope: "staged"})

→ Changed: 5 symbols in 3 files
→ Affected: LoginFlow, TokenRefresh, APIMiddlewarePipeline
→ Risk: MEDIUM
```

## Example: "What breaks if I change validateUser?"

```
1. gitnexus_impact({target: "validateUser", direction: "upstream"})
   → d=1: loginHandler, apiMiddleware (WILL BREAK)
   → d=2: authRouter, sessionManager (LIKELY AFFECTED)

2. READ gitnexus://repo/my-app/processes
   → LoginFlow and TokenRefresh touch validateUser

3. Risk: 2 direct callers, 2 processes = MEDIUM
```

## Runtime-Chain Closure Guard

- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.


## Result completeness and CLI access

`partial: true` (a graph query failed) or `truncated: true` (the changed-symbol
listing was capped) means the result is short of the truth, and reads like
`UNKNOWN` above: a zero there means unseen, not unaffected. Re-run it rather
than tick the pre-commit check.

A wrong-worktree zero carries neither flag and is shape-identical to a genuine
clean result, so confirm the checkout you edited is the one that was diffed
before treating an empty change set as a passed check.

When MCP is unavailable, use `node .gitnexus/run.cjs impact <symbol> --direction upstream --repo .` and `node .gitnexus/run.cjs detect-changes --scope all --repo .`. If the runner is absent, resolve `cliPackageSpec` (then `cliVersion`) from `~/.gitnexus/config.json` and use `npx -y <resolved-spec>`.
Use `detect_changes({scope: "all"})` for the complete working-tree diff.


## Repository identity

Use `list_repos {}` to inspect registered repositories. Follow `offset: pagination.nextOffset` until `hasMore` is false when you need the complete list. Bind subsequent calls explicitly, for example `repo: "my-app"`, when working across repositories. Read-only tools may infer the registered path containing the process cwd, but must not cross an unindexed nested Git checkout. If no sole/default/cwd match exists, resolve the ambiguity before proceeding. For a linked checkout, pass `worktree` to `detect_changes` so its diff comes from the edited checkout.
