---
name: init
description: Use when the user explicitly wants to initialize a non-claw project for claw-kit in Codex.
---
# claw-kit init

Use this skill when the current repo is not already a claw project and the user explicitly wants to initialize it for `@claw-kit`.

## Core rule

For explicit non-claw project initialization in Codex, a visible `claw context` invocation is enough.

Do not invent a longer manual bootstrap checklist when this is the actual task.

## Expected flow

1. Confirm the request is specifically about initializing a non-claw project for `claw-kit`.
2. Run `claw context` from the target project root.
3. Read the result and report whether startup recovery initialized `.claw/`, corrected project config, or found an already healthy project.
4. If `claw context` succeeded, treat the project as initialized for Codex-side claw workflow entry.
5. If the user then wants to do real work in that project, continue with `using-claw-kit` and the normal `claw search -> claw plan create -> workflowGuidance` flow.

## What to communicate

- Say clearly that explicit `claw context` is the initialization action.
- Report the concrete startup recovery result instead of describing initialization abstractly.
- If `claw context` fails, report the failure and debug that failure directly rather than adding unrelated bootstrap steps.

## Guardrails

- Do not tell the user to run `claw init` first when the task is explicit Codex-side project initialization.
- Do not add a manual post-init `claw context` step, because `claw context` itself is the explicit initialization action here.
- Do not route into planning until the initialization request itself is complete.
