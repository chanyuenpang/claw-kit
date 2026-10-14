# Standard hostless entry contract

This document is the entry contract for the claw-kit standard hostless flow:
the workflow shape for any agent platform that can run shell commands but has
no native claw-kit adapter, no host registration, and no lifecycle hooks.
Install the skills shipped in this package. Explicit hostless `claw init` now
creates or updates the same short `using-claw-kit` entry block in project
`AGENTS.md` and `CLAUDE.md`. The host must load one of these files; this is startup
guidance, not a background wakeup. Existing filename casing (such as `claude.md`)
is preserved; multiple case variants are warned about and left untouched.
For hosts using another instruction surface, add the same skill-loading reminder there.

Only the `claw-kit:bootstrap:start` / `claw-kit:bootstrap:end` block is managed;
other content is preserved. Init reports `agentInstructions` and `claudeInstructions` independently with each path and
created/updated/unchanged/skipped status. Malformed or duplicate markers produce
a warning without changing the file. Use `--skip-agent-instructions` to leave
both files untouched (existing blocks are not removed). Reinitialization still
requires `--force`, which retains its existing project-config overwrite semantics;
the entry block itself is updated idempotently. Native-host init and automatic
project setup do not write this block. The block delegates routing and plan
admission to the skill, without copying workflow rules or a fallback file path.

## Explicit host identity

Activate this entry only when the current runtime explicitly has no native
claw-kit adapter. In that case the entry owner declares `[claw host]` with
`platform: standard`; this means hostless CLI, not a model/provider name. Merely
reading this document or installing a standard skill does not override an active
Cindy, Codex, DSH or OpenCode platform declaration. With a native adapter use its
trusted host marker and route; conflicting or missing identity is not permission
to guess or append host flags.

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
   project knowledge, work directly without creating a plan. For temporary
   tracked work, use `--no-knowledge-capture`. New plans use the same automatic
   project setup and lifecycle; capture does not select storage. Never pass `--scope`.
3. **Template owner before generic plan.** If a template-backed skill owns the
   request, use its adjacent template entry instead of first creating a generic
   root plan. Otherwise run `claw plan create "<title>"` and follow the returned
   `workflowGuidance` as the only lifecycle contract.
   Never edit `plan.json` or job files directly.

## Closeout rule

When the root plan reaches `end.completed`, run `claw knowledge prepare --source agent-memory --project-root <path>`, execute the returned assignments from conversation memory, then run `claw knowledge complete --source agent-memory --project-root <path> --config-fingerprint <hash> [--changed-truth <path> ...]`. The terminal workflowGuidance carries this fixed chain.

The chain is non-skippable regardless of an apparently empty result; the
writer side decides whether a knowledge update is warranted.

## Boundaries

- Never pass `--host` or set `CLAW_HOST` in the standard flow.
- Keep claw-generated metadata in English; user content keeps its language.
