# Codex Hooks Strategy

## Current posture

`claw-kit` does not depend on Codex hooks for correctness.

The active adapter now registers a minimal `SessionStart` hook for bootstrap hints only.

The core workflow works without hooks. Hooks are an enhancement layer for:

- lightweight bootstrap nudges
- end-of-session reminders
- tool-level observability

## Why this matters

Plugin-level hooks execute in some Codex builds, but support is still uneven enough that canonical harness semantics do not bind to them.

Current active use:

- `SessionStart` calls a dedicated bootstrap entry.
- `SessionStart` listens to all session starts.
- The only claw-kit runtime gate is that `cwd` resolves into a `.claw` project.
- When that gate is met, the entry runs `claw context`, compresses the result, and injects developer-visible startup guidance.
- The injected guidance tells the agent to use `[@claw-kit](plugin://claw-kit@claw-kit-local)` for the rest of the task flow.

## Testing strategy

The previous local hook lab used:

- `../../scripts/log-hook-event.mjs`
- `../../references/codex-hook-lab.md`
- active bootstrap entry: `../../hooks/session-start-bootstrap.mjs`

The first question is not "can hooks automate the harness?" but "which events fire at all in this runtime?"

## Candidate events

- `SessionStart`
- `PermissionRequest`
- `UserPromptSubmit`
- `Stop`
- `PreToolUse`
- `PostToolUse`
- `PreCompact`
- `PostCompact`
- `SubagentStart`
- `SubagentStop`

## Decision rule

- `SessionStart` is for attach-free bootstrap hints only.
- `Stop` is for truth or ADR reminders, not mandatory writes.
- `PreToolUse` and `PostToolUse` are for diagnostics or validation, not core task binding.
