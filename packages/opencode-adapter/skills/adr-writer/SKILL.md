---
name: adr-writer
description: Use when durable architecture or workflow decisions from completed work should be deposited into canonical ADR documents.
---
# ADR writer

This skill deposits durable decisions into canonical ADRs.
In claw-kit projects, the default ADR corpus is `.claw/truth/adr/`.

## Dispatch model

Dispatch using the `task` tool:
```
task(subagent_type="claw-adr-writer", prompt="<completed plan path + summary>")
```

The main agent must:
1. Identify the completed plan to deposit.
2. Pass the completed plan file path.
3. Do not block waiting for a result.

## ADR-worthy decisions

Architecture boundaries, storage model choices, lifecycle decisions, integration patterns, accepted tradeoffs.
Skip: temporary status, isolated bugfix steps, duplicated decisions.

## Timing

After completed work or a completed plan is available and the decision has lasting consequences.

## Boundary

Generic feature truth goes to truth-writer, not here.
