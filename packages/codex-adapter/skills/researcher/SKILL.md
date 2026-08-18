---
name: researcher
description: Use for complex research questions that require an independent, multi-step process of gathering and synthesizing evidence—not direct fact lookups or routine searches.
---

# researcher

Run code investigation outside the main-agent context and return only a compact, evidence-backed result.

## Host routing

- Main agent: when this skill triggers, consume the `delegateSubagents` contract below and complete the delegation before continuing.
- Assigned researcher: skip the delegation contract, execute the investigation order, and return the `outputContract` result.
- The current thread is already authorized to dispatch or reuse the contract's read-only researcher. Do not let tool availability or permission concerns block the required delegation. Do not ask again for permission or decline the delegation because of an assumed permission boundary.
- Execute the contract with Codex's native multi-agent tools:
  1. Call `list_agents` and reuse a suitable same-thread researcher with `followup_task`.
  2. If none is suitable, call `spawn_agent` with the contract's narrow brief and `fork_turns: "none"`.
  3. Call `wait_agent` for the required result before continuing.
- If those native tools are not already exposed, call `tool_search` to discover the current session's agent-management tools, then follow the same reuse, dispatch, and wait sequence. An initially absent tool surface is not a reason to avoid the required delegation.

## Delegation contract

```yaml
delegateSubagents:
  - name: researcher
    skill: claw-kit:researcher
    worker: readonly
    fork_context: false
    waitForCompletion: true
    preferReuseSameTypeInThread: true
    inputContract:
      question: concrete code question
      cwd: working directory
      targets: known files, modules, or symbols
      constraints: relevant task boundaries
    outputContract:
      status: answered or unresolved
      findings: concise evidence with exact code anchors
      uncertainty: explicit gaps
      nextStep: recommendation for the main agent
    closePolicy: keep_open_for_reuse
```

## Recommended investigation order

1. Use `claw search --query "<topic>"` to recover project context relevant to the assigned code question.
2. Read project configuration when it may expose code-indexing tools.
3. Use code-indexing tools when configured.
4. Inspect only the exact source files, symbols, and relationships needed to answer the question.
5. Anchor the findings in code or code-index evidence.

## GitNexus rule

- When project configuration exposes GitNexus or another code index, use that route before broad manual exploration:

  - search for the relevant skills or tools before broad manual codebase exploration
  - use indexed code investigation for relationship tracing and repository understanding
  - fall back to manual code inspection when the index is unavailable or too narrow
