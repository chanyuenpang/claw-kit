# Codex prompt-driven bootstrap

Use this note when Codex plugin hooks are unavailable or unreliable.

## Decision

For `claw-kit` on Codex, prompt-driven bootstrap remains the baseline path alongside a minimal `SessionStart` hook.

The plugin works on these rules:

- skills load reliably
- plugin command hooks are enhancement only
- `SessionStart` bootstrap recovers `.claw` context before the main workflow starts

## Required startup routine

When `@claw-kit` is used in a real project thread:

1. consume the recovered harness state from session bootstrap
2. identify current task and active plan, when present
3. tell the user what the next harness step should be

## Default routing

- no task scope:
  - create or bind one with `claw plan write`
- task in `prepare.requirements`:
  - enter goal mode first
  - check whether requirements are already clear
  - ask the user only if requirements are still ambiguous
  - otherwise move directly to `process.active`
- task in `process.*`:
  - execute against the active plan
- task near completion:
  - update plan status
  - deposit truth
  - deposit ADRs after `claw plan done`

## Non-goals

- do not depend on `SessionStart` for correctness
- do not depend on `PreToolUse` or `PostToolUse`
- do not invent a second task-binding mechanism outside `plan write`
