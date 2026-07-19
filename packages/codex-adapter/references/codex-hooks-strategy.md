# Codex Hooks Strategy

## Current posture

`claw-kit` does not depend on Codex hooks for correctness.

The active adapter registers a thread-scoped `SessionStart` hook for startup recovery and a turn-scoped `Stop` hook for report capture.

The core workflow works without hooks. Hooks are an enhancement layer for:

- lightweight startup recovery nudges
- one report append when each main-agent turn stops
- tool-level observability

## Why this matters

Plugin-level hooks execute in some Codex builds, but support is still uneven enough that canonical harness semantics do not bind to them.

Current active use:

- `SessionStart` calls the Codex-host recovery entry, which lets `claw context` detect whether the versioned user-level Codex SDK runtime is available before returning project recovery context.
- A missing or invalid runtime produces an English consent-required error prompt for the agent. The CLI does not install, repair, or automatically retry the runtime.
- `SessionStart` runs at thread scope and listens to startup, resume, clear, and compact sources.
- `Stop` runs at turn scope, receives `turn_id` and `transcript_path`, and invokes the Codex-host `auto-doc` entry after the assistant turn stops; before loading the main CLI, `auto-doc` exits unless the session knowledge registry contains an active or pending target. The registry stores no host. The hook writes `codex` directly into a queued finalization job, and the detached worker routes from that snapshot without inheriting a foreground `CLAW_HOST` before loading the Codex SDK writer, normalizing Truth/ADR Markdown encoding, queuing recall refresh, and appending an observable finalization result to the retained report.
- `SessionStart` runs when `cwd` resolves into a `.claw` project or the platform session id resolves to an explicit session-scoped workflow. `Stop` remains project-only: it requires `.claw` directly under hook `cwd` plus a valid session knowledge target; it neither reads plan bindings nor inherits a parent directory's `.claw`, and an uninterested session exits before transcript or project-config work. Session-scoped workflows therefore recover guidance but never trigger knowledge capture.
- When that gate is met, the entry gathers current project startup state and injects developer-visible startup guidance.
- When a session-bound active task is recovered, that guidance also carries the current plan content needed to resume safely.
- The injected guidance tells the agent to use `[@claw-kit](plugin://claw-kit@claw-kit)` for the rest of the task flow.

## Testing strategy

The previous local hook lab used:

- `../../scripts/log-hook-event.mjs`
- `../../references/codex-hook-lab.md`
- active recovery entry: `claw hook auto-claw` (registered under the fixed `SessionStart` event in `hooks.json`)

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

- `SessionStart` is for attach-free startup recovery hints only.
- `Stop` is the fail-open turn report collector; it never owns canonical plan or session transitions.
- `PreToolUse` and `PostToolUse` are for diagnostics or validation, not core task binding.
