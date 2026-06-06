# Codex Hooks Strategy

## Current posture

`claw-kit` does not depend on Codex hooks for correctness.

Hook registration has been removed from the active adapter. This note remains as historical design context only.

The core workflow must still work when hooks do not fire. Hooks are treated as an enhancement layer for:

- lightweight bootstrap nudges
- end-of-session reminders
- tool-level observability

## Why this matters

Recent evidence suggests plugin-level hooks may execute in some Codex builds, but support is still uneven enough that we should not bind canonical harness semantics to them.

## Testing strategy

The previous local hook lab used:

- `../../scripts/log-hook-event.mjs`
- `../../references/codex-hook-lab.md`

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

- If `SessionStart` is reliable, use it for attach-free bootstrap hints only.
- If `Stop` is reliable, use it for truth or ADR reminders, not mandatory writes.
- If `PreToolUse` or `PostToolUse` is reliable for selected tools, use it for diagnostics or validation, not core task binding.
