# OpenCode Hooks Strategy

## Current posture

`claw-kit` on opencode does not depend on host hooks for correctness.

opencode has no `hooks.json` command surface like Codex. Instead the adapter registers a TypeScript plugin (`packages/opencode-adapter/plugin/index.ts`) that subscribes to the opencode event stream and delegates the two canonical claw hook entries:

- `session.created` and `session.compacted` → `claw hook auto-claw --host opencode` (startup recovery)
- `session.idle` → `claw hook auto-doc --host opencode` (turn report capture)

The core workflow works without the plugin. The plugin is an enhancement layer for:

- one-shot startup recovery nudges on new and compacted sessions
- one report append when each main-agent turn goes idle

## Why this matters

opencode emits a `session.idle` event after each assistant turn finishes. There is no dedicated `Stop` event, so `session.idle` is the turn-end equivalent and the only place report capture runs.

Current active use:

- `session.created` / `session.compacted` call the opencode-host recovery entry through `claw hook auto-claw`. Compaction re-runs because the prior system prompt injection is lost when the context window is compressed.
- The plugin tracks `message.updated` (role `assistant`) and `message.part.updated` (type `text`) to cache the latest assistant message text per session.
- `session.idle` hands the cached final assistant message to `claw hook auto-doc --host opencode` via stdin (`{ cwd, session_id, turn_id, message }`). Before loading the main CLI, `auto-doc` exits unless the session knowledge registry contains an active or pending target. Otherwise claw appends one idempotent report entry, and when a plan just completed it queues the host-aware finalization worker.
- The session knowledge registry stays host-free. `session.idle` writes `opencode`
  directly into the queued finalization job; the detached worker selects
  `opencode run` from `job.host` and does not inherit the foreground
  `CLAW_HOST`.
- OpenCode receives projected `nextTask`/`nextsteps` guidance directly. The CLI
  constructs `hostActions` only for Codex, so the plugin has no output-stripping
  compatibility layer.
- Startup recovery requires `cwd` to resolve into a `.claw` project. Turn-report capture requires `.claw` directly under hook `cwd` plus a valid session knowledge target; it neither reads task bindings nor inherits a parent directory's `.claw`.
- When that gate is met, the entry gathers current project startup state and injects developer-visible startup guidance.

## Decision rule

- `session.created` / `session.compacted` are for attach-free startup recovery hints only.
- `session.idle` is the fail-open turn report collector; it never owns canonical plan or session transitions.
- `message.*` events are diagnostics/state tracking only, never core task binding.
- opencode never assumes a Codex SDK runtime is installed; finalization runs through `opencode run`.

## Candidate events

opencode plugin events observed by the adapter: `session.created`, `session.compacted`, `session.idle`, `message.updated`, `message.part.updated`. Other events (`session.status`, `tool.execute.*`, `permission.*`) are available but unused for correctness.
