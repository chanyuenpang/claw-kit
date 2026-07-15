# Codex startup recovery

Use this note when Codex plugin hooks are unavailable or unreliable.

## Decision

For `claw-kit` on Codex, prompt-driven startup recovery remains the baseline path alongside a compact `SessionStart` hook.

The plugin works on these rules:

- skills load reliably
- plugin command hooks are enhancement only
- `SessionStart` recovery restores startup harness state before the main workflow starts
- if `claw context` detects that the project protocol version is ahead of the current CLI, startup recovery must surface `startupRecovery.versionSync` in the prompt
- if `autoUpdate = true` and a newer published claw-kit exists, startup recovery must route the agent to `claw-kit:update` as the first action before other work
- if `autoUpdate = false`, startup recovery must keep the version note informational only and must not inject update execution steps

## Required startup routine

When `@claw-kit` is used in a real project thread:

1. consume the recovered harness state from `SessionStart`
2. if a session-bound active plan can be recovered, surface the claw workflow snapshot, the recomputed `workflowGuidance` contract, and the current plan content needed to resume safely
3. otherwise run `claw context` from the current working directory to recover startup state for this explicit invocation
4. treat `claw context.startupRecovery` as the canonical init-or-correction result for that explicit recovery pass
5. tell the user what the next harness step should be

## Default routing

- session-bound active workflow recovered:
  - use `[@claw-kit](plugin://claw-kit@claw-kit-local)`
  - treat the recovered `workflowGuidance` as the only next-step contract
  - include current plan content in the recovered JSON/additional prompt surface so the resumed agent can continue without reopening the plan first
  - do not repeat static project metadata such as project root or `.claw` path
- no recovered harness state yet:
  - run `claw context`
  - continue when it auto-initializes `.claw/` or corrects `project.json`
  - report the recovered harness state before normal conversation
- no task scope:
  - create or bind one with `claw plan create`
- newly created planning-enabled task:
  - start in `process.discussing`
  - let task 1 refine the request and append executable tasks
  - let task 2 bridge into `process.active`
- task already in `process.discussing`:
  - continue discussion or planning refinement
- task in `process.*`:
  - execute against the active plan
- task near completion:
  - update plan status
  - deposit truth
  - deposit ADRs from the `all tasks done` guidance before root `claw plan done`

## Non-goals

- do not depend on `SessionStart` for correctness
- do not depend on `PreToolUse` or `PostToolUse`
- do not invent a second task-binding mechanism outside `plan create`
- do not branch startup recovery by `SessionStart.source`; use one startup flow and decide only from recoverable workflow or project state
- do not auto-initialize arbitrary repos in the background without an explicit `@claw-kit` invocation
- do not treat local Codex plugin cache refresh as part of `claw context`; plugin payload install remains a separate distribution surface
