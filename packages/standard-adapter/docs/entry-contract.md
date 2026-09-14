# Standard hostless entry contract

This document is the entry contract for the claw-kit standard hostless flow:
the workflow shape for any agent platform that can run shell commands but has
no native claw-kit adapter, no host registration, and no lifecycle hooks.
Paste the rules below into the platform's system-prompt surface (CLAUDE.md,
AGENTS.md, rules files, custom instructions) together with the skills shipped
in this package.

## Prerequisites

- The `claw` CLI is installed (`npm install -g @veewo/claw`) and on PATH.
- The project has been initialized (`claw init`) or the first `claw context`
  call auto-initializes `.claw` in the project root.
- One stable session id per conversation: `export CLAW_SESSION_ID=<id>`.

## Entry rules

1. **Recovered workflow wins.** At the start of a task in a `.claw` project,
   run `claw context`. If it returns `activeWorkflow`, do not create a plan;
   follow the recovered `workflowGuidance` and continue the current task.
2. **No knowledge, no plan.** If the request will not produce reusable
   project knowledge, work directly without creating a plan. Use
   `--scope session` for temporary tracked work that must not deposit
   knowledge; the default project scope is the full workflow.
3. **Plan before execute.** Otherwise run `claw plan create "<title>"` and
   follow the returned `workflowGuidance` as the only lifecycle contract.
   Never edit `plan.json` or job files directly.

## Closeout rule

When the root plan reaches `end.completed`, the required closeout depends on
the effective `knowledgeWriter.executionPolicy`:

- **`main-agent` (default)**: run `claw knowledge prepare --source agent-memory
  --project-root <path>`, execute the returned assignments yourself from your
  own conversation memory (no reports, transcripts, jobs, or subagents), then
  run `claw knowledge complete --source agent-memory --project-root <path>
  --config-fingerprint <hash> [--changed-truth <path> ...]`. The plan
  terminal `workflowGuidance` carries this chain.
- **`background` (explicit opt-in)**: `claw internal-knowledge-capture` with
  stdin JSON reporting the final answer (`cwd`, `session_id`, `turn_id`,
  `message`) creates the durable background job and returns `nextStep.jobPath`;
  then `claw internal-knowledge-dispatch --job <jobPath>` returns the writer
  `dispatch.prompt`; execute that prompt's `claw plan create --template-file
  ...` command and follow the writer plan's `workflowGuidance` to completion.

The chain is non-skippable regardless of an apparently empty result; the
writer side decides whether a knowledge update is warranted.

## Boundaries

- Never pass `--host` or set `CLAW_HOST` in the standard flow.
- `knowledgeWriter.executionPolicy` may be omitted (the standard host resolves
  it to `main-agent`), or set explicitly to `main-agent` or `background`.
  The `subagent` policy requires a host-registered claim-time report collector
  and is rejected on this shape.
- Keep claw-generated metadata in English; user content keeps its language.
