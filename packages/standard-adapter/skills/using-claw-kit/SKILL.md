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

## Knowledge closeout (background chain)

The standard hostless flow has no host-registered claim-time report collector,
so `knowledgeWriter.executionPolicy` must keep its default `background` value.
Closeout is a required, non-skippable three-step chain executed by you:

1. **Capture the final answer inline.** After completing the root plan's work,
   report the final assistant message for the task:

   ```
   claw internal-knowledge-capture
   ```

   with stdin JSON `{"cwd": "<project root>", "session_id": "<CLAW_SESSION_ID>", "turn_id": "<turn id>", "message": "<final answer summary>", "task_conclusions": []}`.
   A successful capture writes the report, creates the durable background
   job, and returns `nextStep` with its `jobPath`.

2. **Take the writer dispatch.** Run
   `claw internal-knowledge-dispatch --job <jobPath>` and use the returned
   `dispatch.prompt` verbatim.

3. **Execute the writer plan yourself.** Run the prompt's
   `claw plan create --template-file ... --title "knowledge-finalizer-<id>"`
   command, then follow the returned `workflowGuidance` until that writer
   plan completes. The writer plan is session-scoped by design: it claims the
   job, executes the knowledge-writer assignments, and its terminal
   transition records `knowledge done`. Do not wait for or poll an external
   worker; do not invoke a subagent, background finalizer, or delegate skill.

Do not skip the chain because the work appears to contain no knowledge — the
writer plan itself decides whether a knowledge update is warranted. If the
conversation ends before the chain completes, the durable job remains
claimable; resume by running the chain from step 1 (capture) only if the
report was not written, otherwise continue from step 2.

## Investigation

Use `claw search --query "<topic>"` before broader code investigation: it
recalls project memory, truth, and ADR material first, then use the platform's
native code search to locate exact files or symbols.

## Hard boundaries

- Edit canonical plan state only through claw commands supplied or permitted by returned guidance; never edit `plan.json` or job files directly.
- Do not add `--host` or set `CLAW_HOST`; the hostless invocation shape is the supported path on platforms without a native adapter.
- Do not switch `knowledgeWriter.executionPolicy` to `subagent`: without a host-registered collector the claim cannot collect its report and will fail.
- Keep claw harness mechanics out of normal replies unless the user asks about them or they are necessary to explain a blocker or result.
- Keep claw-generated metadata in English while preserving user-supplied project content in its original language.
