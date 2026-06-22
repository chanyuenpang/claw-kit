---
name: adr-writer
description: Use when a completed .claw plan should be deposited into canonical ADR documents.
---
# claw-kit ADR writer

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

After `claw plan done` succeeded and completed plan file is available.

## Boundary

Generic feature truth goes to truth-writer, not here.