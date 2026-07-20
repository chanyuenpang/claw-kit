# OpenCode workflowGuidance consumption

Use this note when opencode drives `claw` commands that return `workflowGuidance`.

## Core rule

Treat returned `workflowGuidance` as the primary next-step contract. Unlike Codex, opencode has no fixed code-mode driver: the agent executes claw commands directly through its bash tool. The CLI returns stage-minimal guidance and the agent honors it directly.

## Fields to honor

### `askUser`

Use the supplied choices and ordering when the workflow needs a route decision.

### `commandHints`

Use these commands only as syntax and lookup aids for possible future mutations. They do not define the current next step or require immediate execution. On opencode the agent runs a selected command directly via the bash tool.

## Lifecycle interpretation

- `process.discussing`: analyze the request through the seeded planning task and configured planning skill; do not implement yet. A recommended `claw search` command is optional recall, not a required next step.
- `process.active`: execute one task at a time and keep plan status current.
- `process.wait`: stop execution until the user or dependency resumes it.
- task completion with an open plan: continue with the next lifecycle action.
- all tasks done: clear thread progress, write retrospective and key decisions, then run `claw plan done`.
- subplan done: canonical completion restores the parent binding.
- root plan done: canonical completion unbinds the session.
