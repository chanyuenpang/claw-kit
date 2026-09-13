---
name: using-claw-kit
description: Use first whenever claw-kit workflow is active in a .claw project on a host without a native claw-kit adapter; this is the main-agent contract for the standard hostless flow (no host flag, no hooks).
---
# using-claw-kit (standard hostless)

## Availability boundary

If the `claw` CLI is unavailable, skip claw-kit and continue the user's task
directly. Do not claim that the task cannot proceed solely because claw-kit
is unavailable.

For claw-kit usage questions, read the adjacent `../claw-kit-doc/SKILL.md`
entry and only the relevant reference for project configuration or Truth/ADR
format.

## Host identity

The standard hostless flow needs no `--host` flag and no `CLAW_HOST`
environment variable. Session identity comes from the environment: export
`CLAW_SESSION_ID=<stable per-conversation id>` before running claw commands
(the CLI also accepts `CODEX_THREAD_ID` or `CODEX_SESSION_ID` for the same
purpose). Use the same id for every command in one conversation; a new
conversation uses a new id.

## First Action

1. If the request is not expected to produce reusable project knowledge, skip this skill and work directly. Otherwise, run `claw context` first: it recovers a session-bound active plan when one exists, and reports project/version diagnostics only when action is needed.
2. When `claw context` returns an `activeWorkflow`, do not create a new plan; follow its recovered `workflowGuidance` and continue the current task.
3. Otherwise run `claw plan create "<title>"` (project scope: the full workflow with canonical knowledge deposition). Use `--scope session` only for temporary work that must not deposit knowledge.
4. If a template-backed workflow skill fully owns the request, follow that skill's entry route so it supplies its adjacent template file.
5. Follow the returned `workflowGuidance` as the only lifecycle contract. Use its stage and current task to determine the current work; `commandHints` are command lookup aids, not required next mutations.

## Lifecycle semantics

Treat claw-kit as an assistive workflow tool. Use plans and tasks to focus
attention, coordinate work, and preserve progress; do not treat them as
immutable authority. Adjust the goal, scope, and task breakdown promptly when
user needs or new evidence require it. When an independently manageable scope
would keep expanding a parent task, create a subplan instead.

- `process.discussing`: execution is paused for user discussion. Do not implement or close it before the discussion is settled.
- `process.active`: execute one task at a time and keep plan progress current through returned guidance. Before each successful `task done`, state a concise evidence-backed task conclusion in the immediately preceding assistant message.
- `process.wait`: when execution is blocked on user input or an external dependency, move the plan to `process.wait`, then stop until returned guidance resumes it.
- `end.completed`: the canonical completed plan status. Record the retrospective and durable key decisions, then run `claw plan done --retrospective "<summary>"`.

## Knowledge closeout

The standard hostless flow resolves `knowledgeWriter.executionPolicy` to
`main-agent` by default (no host-registered claim-time report collector
exists). Closeout is required and non-skippable.

**Default `main-agent` closeout (two steps):**

1. **Prepare the assignment projection.** After completing the root plan's
   work, run:

   ```
   claw knowledge prepare --source agent-memory --project-root <project root>
   ```

   It returns `configFingerprint` and the ordered `assignments`.

2. **Execute and complete.** Execute each assignment yourself using only
   conclusion-bearing content already in your conversation memory: read or
   create no report, transcript, plan, subplan, job, or subagent. Then run:

   ```
   claw knowledge complete --source agent-memory --project-root <project root> --config-fingerprint <hash> [--changed-truth <absolute path> ...]
   ```

   with every canonical Truth/ADR document you changed. If the configuration
   changed after prepare, run prepare again before completing.

**Explicit `background` closeout (three steps):** with
`knowledgeWriter.executionPolicy: "background"` configured explicitly, run
`claw internal-knowledge-capture` with stdin JSON `{"cwd": "<project root>",
"session_id": "<CLAW_SESSION_ID>", "turn_id": "<turn id>", "message": "<final
answer summary>", "task_conclusions": []}`, then `claw
internal-knowledge-dispatch --job <jobPath>`, then execute the returned
`dispatch.prompt` (its `claw plan create --template-file ...` command) and
follow the writer plan's `workflowGuidance` to completion.

Do not skip closeout because the work appears to contain no knowledge — the
assignment contract itself decides whether a knowledge update is warranted.

## Investigation

Use `claw search --query "<topic>"` before broader code investigation: it
recalls project memory, truth, and ADR material first, then use the platform's
native code search to locate exact files or symbols.

## Hard boundaries

- Edit canonical plan state only through claw commands supplied or permitted by returned guidance; never edit `plan.json` or job files directly.
- Do not add `--host` or set `CLAW_HOST`; the hostless invocation shape is the supported path on platforms without a native adapter.
- Do not switch `knowledgeWriter.executionPolicy` to `subagent`: without a host-registered collector the claim cannot collect its report and will fail. Omit it (resolves to `main-agent`) or use `background` explicitly.
- Keep claw harness mechanics out of normal replies unless the user asks about them or they are necessary to explain a blocker or result.
- Keep claw-generated metadata in English while preserving user-supplied project content in its original language.
