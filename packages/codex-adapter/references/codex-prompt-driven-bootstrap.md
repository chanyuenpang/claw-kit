# Codex prompt-driven bootstrap

Use this note when Codex plugin hooks are unavailable or unreliable.

## Decision

For `claw-kit` on Codex, prompt-driven bootstrap remains the fallback even though a minimal `SessionStart` hook now exists.

The plugin works on these rules:

- skills load reliably
- plugin command hooks are enhancement only
- `.claw` context must still be recovered at the start of real work

## Required startup routine

When `@claw-kit` is used in a real project thread:

1. run `claw context`
2. identify whether `.claw/` exists
3. identify current task and active plan, if any
4. tell the user what the next harness step should be

## Default routing

- no task scope:
  - create or bind one with `claw plan write`
- task in `prepare.requirements`:
  - continue planning and review before execution
- task in `process.*`:
  - execute against the active plan
- task near completion:
  - update plan status
  - deposit truth
  - deposit ADRs when decisions are durable

## Non-goals

- do not depend on `SessionStart` for correctness
- do not depend on `PreToolUse` or `PostToolUse`
- do not invent a second task-binding mechanism outside `plan write`
