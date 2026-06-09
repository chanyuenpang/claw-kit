# ADR: Prompt-Driven Codex Bootstrap

## Context

`claw-kit` originally explored Codex hooks as the automatic session-entry mechanism for `.claw` harness behavior.

In local testing:

- plugin capabilities were injected correctly
- plugin cache refresh worked
- hook configuration could be installed and feature-gated
- command hook log files still did not appear

At the same time, Codex session transcripts showed that plugin skills were being loaded at startup.

## Decision

For the Codex adapter, use prompt-driven bootstrap as the primary startup mechanism.

The first session-entry skill is `claw-kit:bootstrap`.

## Consequences

- Codex startup should recover `.claw` context explicitly via prompt/skill flow.
- `plan write` remains the canonical task-binding mechanism.
- Hooks stay experimental and optional.
- Future Codex runtime improvements may reintroduce hooks as an enhancement layer, but not as a correctness dependency.
