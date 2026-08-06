# Codex workflowGuidance consumption

Use this note when Codex drives `claw` commands that return `workflowGuidance`.

## Core rule

Treat returned `workflowGuidance` as the only next-step contract. Codex plan mutations run only through the fixed code-mode driver in `skills/using-claw-kit/SKILL.md`; the driver validates and consumes `hostActions` in the same call and returns a stage-minimal result.

## Fields to honor

### `askUser`

Use the supplied choices and ordering when the workflow needs a route decision.

### `commandHints`

Use these commands only as syntax and lookup aids for possible future mutations. They do not define the current next step or require immediate execution. Keep any command execution inside the fixed code-mode driver.

### stage-minimal results and `hostActions`

The CLI projects only actionable stage data, exact commands, next task, user input, create-time plan/review data, and closeout state. The driver consumes each validated host action at most once. Goal actions come only from committed plan status; the agent must not reconstruct `goalTool`, split host calls, or compensate by mutating plan state again.

Host-action failure does not roll back canonical CLI state. The failed action remains retryable through the driver contract.

Code-mode consumption is the adapter execution method. The CLI-provided versioned driver is the single distributed runtime consumer; the adapter repository keeps a non-distributed test oracle only for contract tests. The driver enforces an explicit stage-aware allowlist, accepts schema v1 native `create_goal` or `update_goal`, and consumes each action exactly once. Before a Goal mutation, the program inspects `get_goal`: `create_goal` executes only when there is no nonterminal Goal. When a Goal already exists, the driver preserves it and returns a visible recovery note without mutating Goal state. Completion skips `update_goal` when no active Goal remains. The agent must never inspect Goal state through a separate `get_goal` call. The driver and test oracle do not parse host error wording or invent compensation. A recovered active session runs `plan sync` once through the bridge to restore progress and create a missing Goal without disturbing an existing one. Unknown schemas fail closed. Codex has no separate host-call fallback, and Codex compact results do not return `goalMode` or `goalTool`.

## Lifecycle interpretation

- `process.discussing`: analyze the request through the seeded planning task and configured planning skill; do not implement yet. A recommended `claw search` command is optional recall, not a required next step.
- `process.active`: execute one task at a time and keep plan status current.
- `process.wait`: stop execution until the user or dependency resumes it.
- task completion with an open plan: continue with the returned next task.
- all tasks done: clear host progress, write retrospective and key decisions, then run `claw plan done`.
- subplan done: canonical completion immediately restores the parent binding.
- root plan done: canonical completion immediately unbinds the session.

## Anti-patterns

- Do not run a plan mutation outside the fixed code-mode driver.
- Do not repeat a canonical transition to compensate for a host-action failure.
- Do not continue executing after `process.wait` or `process.discussing` until the workflow resumes.
