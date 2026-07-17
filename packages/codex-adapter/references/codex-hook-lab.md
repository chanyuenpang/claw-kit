# Codex Hook Lab

## Goal

Determine which plugin-level Codex hooks actually fire in this runtime before we design any production automation on top of them.

This document is historical. Active hook registration has been removed from `claw-kit`.

## Files used during the experiment

- `../../scripts/log-hook-event.mjs`
- log output: `../../.hook-lab/events.jsonl`

## Configured events

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

The tool hooks are intentionally limited to official currently matchable names and aliases:

- `Bash`
- `apply_patch`
- `Edit`
- `Write`
- `mcp__.*`

## What the logger captures

- event name
- timestamp
- current working directory
- plugin hook environment variables
- raw stdin payload when present

## Manual validation flow

1. Install or reload the local `claw-kit` plugin in Codex.
2. Start a fresh Codex session inside a real `.claw` project.
3. Send one normal user message.
4. Execute one Bash tool action and one `apply_patch` edit action.
5. Trigger at least one compaction or subagent path if possible.
6. End or stop the session.
7. Inspect `.hook-lab/events.jsonl`.

## What to look for

- Does `SessionStart` log on a fresh session?
- Does `PermissionRequest` fire only when Codex is actually about to ask for approval?
- Does `UserPromptSubmit` log for normal user turns?
- Do `PreToolUse` and `PostToolUse` log around actual tool calls?
- Which official `tool_name` values show up in stdin JSON?
- Do `PreCompact` and `PostCompact` log with `trigger=manual|auto`?
- Do `SubagentStart` and `SubagentStop` expose stable `agent_type` metadata?
- Does `Stop` fire with continuation-capable fields like `last_assistant_message`?
- Does stdin include structured payload JSON or only environment hints?

## Success criteria

Hooks are considered usable only if:

- they fire consistently across repeated fresh sessions
- the event payloads are stable enough to identify session and tool context
- failures or no-op runs do not break the main Codex workflow

## Non-goals

- no task binding through hooks in this phase
- no plan guard automation through hooks in this phase
