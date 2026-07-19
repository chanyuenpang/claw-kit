---
name: researcher
description: Delegate code investigation, source inspection, symbol or dependency tracing, code architecture analysis, and current implementation behavior analysis to a focused researcher subagent. Reuse a related researcher already available in the same thread.
---

# researcher

Run code investigation outside the main-agent context and return only a compact, evidence-backed result.

## Host routing

- Main agent: when this skill triggers, consume the `delegateSubagents` contract below and complete the delegation before continuing.
- Assigned researcher: skip the delegation contract, execute the investigation order, and return the `outputContract` result.

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
