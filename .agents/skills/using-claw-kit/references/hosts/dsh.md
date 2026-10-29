# DSH execution route

Use this route when the active DSH adapter exposes `claw_run`, even if the
loaded skill came from a workspace hostless installation.

## Recovery and mutations

Consume the injected [claw workflow] snapshot first. If absent, call
`claw_run` with operation `context` and no arguments (or `plan.show`
for the current plan). Follow the recovered stage and next task.

All workflow operations use `claw_run`: `operation` is dot-form and
`args` uses the advertised snake_case fields. Returned `commandHints`
map to that tool's arguments. Call it through the current SDK execution tool
when required by the host. Do not use pwsh/shell to run claw workflow commands:
the adapter owns daemon binding and consumes host actions automatically.
Standalone non-workflow diagnostics and static authoring utilities (such as
`claw template validate --file`) are not workflow mutations. They may use the
host command tool when authorized; this exception never permits plan/task/
subplan or automatic knowledge-closeout shell bypass. Explicit manual capture
is a separate same-agent document edit, with no CLI runner or lifecycle recovery.

- Session identity and workspace are host-forged: never supply session, host,
  or workdir arguments.
- The canonical .claw plan is authoritative. DSH Goal and progress are
  projections: do not call Goal tools or maintain a parallel todo list.
- Create/start/edit/complete plans and tasks through the advertised operations;
  pass retrospective and `key_decisions` when closing. Project closeout needs
  its retrospective. Use `subplan.create` with the supplied template only
  when supported. Never infer an operation or argument from CLI spelling.
- Use `search` for recall and `search.index.refresh` only when needed;
  the latter accepts no arguments and is scoped to this session's project.

## Required role work

For researcher/feature-architect work, use `claw_run` `delegate.start` with the
role, bounded brief and output policy; use `delegate.result` for the returned
assignment. The adapter owns backend selection, reuse, waiting, recovery and
validated report registration. Workers submit their supplied `delegate.complete`
contract, not parent lifecycle operations. Unsupported semantic operations require
a matching adapter update, not manual Team/native choreography.

## Knowledge closeout

A terminal source plan returns a handoff that the adapter sends to one native
worker. Dispatch only starts the work; it does not certify materials or own a
second completion record. Model/effort preferences are best effort and never
block on optional metadata.

The worker receives the source session key and full source-plan path. It calls
`claw_run knowledge.materials` with `source_session_key` and `source_plan`,
reads the full plan and available ordinary conversation, and may search for more
context. It creates the returned non-capturing auxiliary plan, follows its
knowledge subplan, and closes those ordinary plans with the actual outcome.
No claim, token, lease, receipt, separate result registration or dual-terminal
wait is part of this new flow. Read failures are diagnostics for the worker,
not an admission gate or proof of empty history.

After accepted dispatch, finish the lead response without spawning another
writer or waiting for its result. Report real dispatch failures; acceptance is
not proof that documents were updated. Do not replay a terminal mutation to
repair dispatch. Old finalization jobs are not automatically resumed or rewritten.
