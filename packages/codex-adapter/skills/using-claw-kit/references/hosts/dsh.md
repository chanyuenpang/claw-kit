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
is a separate non-workflow skill with its own same-agent runner and eligibility.

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

The adapter, not the model, owns capability-selected Team/native finalizer
dispatch and safe role reuse for the default finalization route. The adapter owns report capture and worker
dispatch and returns compact evidence; follow that evidence rather than
reconstructing collector internals or timing from this skill.
Do not spawn another finalizer, run its prompt yourself, poll the worker, or
reconstruct a hidden prompt. After an accepted/automatically owned handoff,
end the main turn. Report actual failures; do not describe an accepted handoff
as completed Truth/ADR deposition. Do not replay plan.done to repair dispatch.

**Current main-agent integration gap:** configuration may allow main-agent,
but the current `claw_run` contract does not expose knowledge.prepare or
knowledge.complete. If terminal guidance requests this chain, surface the
unsupported adapter route and leave closeout visibly incomplete. Do not invent
these operations, shell-bypass the adapter, silently change the policy, or use
the public manual capture skill. A separate runtime fix is required before
this route can execute that policy.
