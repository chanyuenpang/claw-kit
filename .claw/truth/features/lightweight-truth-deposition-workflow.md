# Lightweight Truth Deposition Workflow

## Status

Accepted working truth for the current `claw-kit` workflow revision.

## Core facts

- `claw plan write` and `appendTasks` no longer auto-insert `Update truth (if got valuable contexts)` tasks.
- The workflow is back to the lighter model: finish the normal task, dispatch `truth-writer` only when the completed subtask produced reusable knowledge, then continue with the next task.
- The compact task-completion guidance now says:
  - `If the completed subtask produced reusable knowledge, dispatch truth-writer.`
  - `Continue with next task: id xx content xxx`
- The lighter model is reflected in workflow docs, canonical truth summary, and tests.
- Verification baseline for this revision is `npm test` and `npm run check`.

## Practical implications

- Future agents should not assume automatic truth follow-up tasks are part of plan creation or task appends.
- `truth-writer` remains the canonical deposition specialist, but it is triggered explicitly from completed work rather than injected plan tasks.
- Plan reading and task completion should follow the lighter chain: normal task -> conditional `truth-writer` -> next task.
