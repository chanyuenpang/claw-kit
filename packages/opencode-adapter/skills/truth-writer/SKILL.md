---
name: truth-writer
description: Use when a completed subtask report should be deposited into canonical .claw truth.
---
# claw-kit truth writer

## Dispatch model

Dispatch using the `task` tool:
```
task(subagent_type="claw-truth-writer", prompt="<completed subtask report>")
```

The main agent must:
1. Finish the primary task work.
2. Curate valuable findings into a completed subtask report.
3. Dispatch `claw-truth-writer`.
4. Do not block the main task lifecycle waiting for a result.

The agent definition already contains the deposition spec.

## What truth is for

- investigate faster
- locate code faster
- understand stable constraints and behavior

## Only write durable knowledge

Stable architecture facts, durable behavior, debugging knowledge, long-lived constraints.
Skip: temporary progress, one-off updates, speculative conclusions.

## Timing

Run at task-completion time, before retrospective closure.

## Boundary

Architecture decisions go to adr-writer, not here.