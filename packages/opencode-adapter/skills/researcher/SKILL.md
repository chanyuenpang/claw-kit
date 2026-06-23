---
name: researcher
description: Use when an investigation-type task should be delegated to a narrow specialist subagent to recover context, inspect code, and summarize findings.
---
# researcher

## When to use

- codebase investigation
- truth/ADR lookup
- architecture understanding
- behavior tracing
- evidence gathering

## Delegation model

Dispatch using the `task` tool:
```
task(subagent_type="claw-researcher", prompt="<investigation question + target files>")
```

Send only the minimum bundle: investigation question, target files/paths, relevant task name, and available recall or code-indexing tools.

## Investigation order

1. Use project recall first when available; in claw-kit projects, use `claw search --query "<topic>"`
2. For truth lookup, search the canonical truth corpus
3. For architecture history, search the canonical ADR corpus
4. Read project configuration when it may expose indexing, memory, or routing tools
5. Use configured code-indexing tools before broad manual exploration
6. Use local code inspection only for exact files needed

## Boundary

- Do not mutate truth docs.
- Do not write ADRs.
- Do not drift into implementation.
