# Qoder Hooks Strategy

## Current posture

`claw-kit` on Qoder uses Qoder's native hook system for automatic lifecycle coverage.

The plugin registers two hook handlers in `hooks/hooks.json`:

- `SessionStart` (matcher: `startup|resume|clear|compact|new`) → calls `claw hook auto-claw --host qoder` for startup recovery
- `Stop` → calls `claw hook auto-doc --host qoder` for turn report capture

Both hooks use the `command` type, which runs shell commands directly.

## Event mapping

| Qoder Event | claw CLI Command | Codex Equivalent | OpenCode Equivalent |
|---|---|---|---|
| `SessionStart` | `claw hook auto-claw --host qoder` | `SessionStart` hook | `session.created` + `session.compacted` |
| `Stop` | `claw hook auto-doc --host qoder` | `Stop` hook | `session.idle` |

## Input format compatibility

Qoder's hook events send JSON via stdin with common fields (`session_id`, `cwd`, `hook_event_name`) that claw CLI already handles.

The only adaptation needed was for the `Stop` event: Qoder sends `last_assistant_message` instead of `message`. The claw CLI now accepts `last_assistant_message` as a fallback when `message` is absent.

Similarly, Qoder's `Stop` event does not include `turn_id`. The claw CLI falls back to using `session_id` as the turn identifier when `turn_id` is absent.

## Available but unused events

Qoder supports many more hook events that claw-kit does not currently use:

- `PostCompact` — could re-inject context after compaction (currently handled by SessionStart `compact` matcher)
- `PreToolUse` — could audit or validate claw CLI commands before execution
- `SubagentStart`/`SubagentStop` — could track researcher subagent lifecycle
- `FileChanged` — could watch `.claw/plan.json` for external changes

These remain as future enhancement opportunities.
