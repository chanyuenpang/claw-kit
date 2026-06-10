# Codex startup recovery

Use this note when Codex plugin hooks are unavailable or unreliable.

## Decision

For `claw-kit` on Codex, prompt-driven startup recovery remains the baseline path alongside a minimal `SessionStart` hook.

The plugin works on these rules:

- skills load reliably
- plugin command hooks are enhancement only
- `SessionStart` recovery restores startup harness state before the main workflow starts

## Required startup routine

When `@claw-kit` is used in a real project thread:

1. consume the recovered harness state from `SessionStart`
2. if a session-bound active plan can be recovered, surface only the minimal claw workflow snapshot and the recomputed `workflowGuidance` contract
3. otherwise run `claw context` from the current working directory to recover startup state for this explicit invocation
4. treat `claw context.startupRecovery` as the canonical init-or-correction result for that explicit recovery pass
5. tell the user what the next harness step should be

## Default routing

- session-bound active workflow recovered:
  - use `[@claw-kit](plugin://claw-kit@claw-kit-local)`
  - treat the recovered `workflowGuidance` as the only next-step contract
  - do not repeat static project metadata such as project root or `.claw` path
- no recovered harness state yet:
  - run `claw context`
  - continue when it auto-initializes `.claw/` or corrects `project.json`
  - report the recovered harness state before normal conversation
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
- do not branch startup recovery by `SessionStart.source`; use one startup flow and decide only from recoverable workflow or project state
- do not auto-initialize arbitrary repos in the background without an explicit `@claw-kit` invocation
