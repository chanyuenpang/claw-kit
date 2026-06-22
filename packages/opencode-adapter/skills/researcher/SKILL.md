---
name: researcher
description: Use when an investigation-type task should be delegated to a narrow specialist subagent to recover context, inspect code, and summarize findings.
---
# claw-kit researcher

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

Send only the minimum bundle: investigation question, target files/paths, relevant task name, gitnexus state.

## Investigation order

1. `claw search --query "<topic>"` to recover .claw context
2. For truth: `claw search` against `.claw/truth/`
3. For architecture history: `claw search` against `.claw/truth/adr/`
4. Read `.claw/project.json`
5. If `gitnexus.enabled = true`, use GitNexus for code investigation
6. Local code inspection only for exact files needed

## Boundary

- Do not mutate truth docs.
- Do not write ADRs.
- Do not drift into implementation.