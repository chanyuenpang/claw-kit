# Lightweight Truth Deposition Workflow

## Status

Superseded.

The no-auto-inserted-task history and encoding rule remain useful evidence, but `truthDispatch`, mid-task `truth-writer` delegation, and the separate closeout Truth/ADR route are not current lifecycle claims. Current ownership is in `codex-knowledge-capture-boundary.md` and `.claw/truth/adr/hook-owned-two-phase-knowledge-finalization.md`: completed project plans use one hook-owned consistency-aware `knowledge-writer` pass.

## Core facts

- `claw plan write` and `appendTasks` no longer auto-insert `Update truth (if got valuable contexts)` tasks.
- The workflow is back to the lighter model: finish the normal task, dispatch `truth-writer` only when the completed subtask produced reusable knowledge, then continue with the next task.
- canonical `.claw/project.json` now exposes flat `truthDispatch` as the project-level control surface for truth delegation timing.
- when `truthDispatch = "final_only"`, mid-task `truth-writer` delegation is suppressed even if a completed subtask produced reusable knowledge.
- `final_only` does not disable closeout deposition: once the workflow reaches `process.allTasksDone`, closeout truth/ADR deposition is still allowed before retrospective closure.
- canonical `.claw/truth/` markdown is expected to stay in UTF-8 with BOM for Windows PowerShell compatibility; truth deposition should preserve that encoding instead of rewriting files as plain UTF-8 without BOM.
- The compact task-completion guidance now says:
  - `If the completed subtask produced reusable knowledge, dispatch truth-writer.`
  - `Continue with next task: id xx content xxx`
- The lighter model is reflected in workflow docs, canonical truth summary, and tests.
- Verification baseline for this revision is `npm test` and `npm run check`.

## Practical implications

- Future agents should not assume automatic truth follow-up tasks are part of plan creation or task appends.
- `truth-writer` remains the canonical deposition specialist, but dispatch timing is now additionally gated by flat `truthDispatch` instead of being unconditional on every reusable completed subtask.
- If a truth doc fails repo encoding audit after merge or manual edits, restore UTF-8 BOM before treating the deposition as complete; `npm run check` enforces this through the truth encoding audit.
- Plan reading and task completion should follow the lighter chain: normal task -> conditional `truth-writer` -> next task, unless the project explicitly switches truth dispatch to `final_only`.

## Related code

- `packages/core/src/truth.ts`
- `packages/core/src/workflow-guidance.ts`
- `packages/core/src/workflow-guidance.config.json`
- `packages/core/src/types.ts`
- `packages/core/src/text-encoding.ts`
- `packages/core/test/core.test.ts`
- `packages/cli/test/cli.test.ts`
- `scripts/truth-encoding-audit.mjs`
