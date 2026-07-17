# Codex delegated subagent dispatch

Use this note when `workflowGuidance.delegateSubagents` is present.

## Core rule

Each entry is a structured dispatch contract. Honor `dispatch`, model, reasoning effort, `fork_context`, wait behavior, input/output contracts, reuse preference, and close policy. Use the current Codex multi-agent surface and send only the narrow bundle required by the specialist.

Codex knowledge deposition is not a delegated main-agent responsibility. Never dispatch `truth-writer`, `adr-writer`, or `knowledge-writer` from this surface. The independent Stop hook and Codex SDK worker own report-based truth and ADR closeout.

## Research and review specialists

- Use an explorer-style worker for bounded investigation when returned guidance requires it.
- Do not read the search skill inline; attach the `claw-kit:researcher` skill item with the exact question or target paths.
- If the task is research, wait for completion. Do not skip ahead of a result that current execution depends on.
- Reuse a suitable same-type specialist when the contract requests reuse.
- Apply useful results back through canonical claw or repository operations.

## Anti-patterns

- Do not describe a handoff without actually dispatching it.
- Do not clone full thread context when `fork_context: false`.
- Do not create deposition subagents to compensate for a missing or failed hook.
- Do not let a specialist mutate canonical plan lifecycle unless its returned contract explicitly requires that operation.
