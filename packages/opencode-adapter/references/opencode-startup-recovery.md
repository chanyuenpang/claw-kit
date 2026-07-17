# OpenCode startup recovery

Use this note when opencode plugin events are unavailable or unreliable.

## Decision

For `claw-kit` on opencode, prompt-driven startup recovery remains the baseline path, delivered through the adapter plugin's `session.created` and `session.compacted` handlers which call `claw hook auto-claw --host opencode`.

The plugin works on these rules:

- skills load reliably through `skills.paths` in `opencode.json`
- plugin event handlers are enhancement only
- `session.created` recovery restores startup harness state before the main workflow starts
- if `claw context` detects that the project protocol version is ahead of the current CLI, startup recovery surfaces `startupRecovery.versionSync` in the prompt
- if `autoUpdate = true` and a newer published claw-kit exists, startup recovery routes the agent to `claw-kit:update` as the first action before other work
- if `autoUpdate = false`, startup recovery keeps the version note informational only

## Required startup routine

When claw-kit is used in a real opencode project thread:

1. consume the recovered harness state from `session.created`
2. if a session-bound active plan can be recovered, surface the claw workflow snapshot, the recomputed `workflowGuidance` contract, and the current plan content needed to resume safely
3. otherwise run `claw context` from the current working directory to recover startup state
4. when present, treat `claw context.startupRecovery` as the canonical init-or-correction result; healthy runs omit it
5. tell the user what the next harness step should be

## Runtime gate

opencode never checks for a Codex SDK runtime. The opencode finalization worker runs through `opencode run` and does not require `codex-runtime` consent. A missing or invalid `claw` CLI is the only local dependency the agent must surface in plain language.

## Non-goals

- Do not depend on plugin events for correctness.
- Do not invent a second task-binding mechanism outside `plan create`.
- Do not branch startup recovery by event source.
- Do not treat local opencode plugin install refresh as part of `claw context`; plugin payload install remains a separate distribution surface.
