# Researcher host execution

## DSH

Use the native adapter's semantic delegation operations through run_code:

- Main: tools.claw_run({operation: "delegate.start", args: {role: "researcher", brief: "<bounded question, targets and constraints>", output: "reply"}}).
- Obtain the returned assignment with tools.claw_run({operation: "delegate.result", args: {assignment_id: "<returned id>"}}) before dependent work. Waiting is bounded; continue independent work when still pending, never redispatch the request to repair an unknown outcome.
- The adapter owns Team/native selection, member reuse, identity, queueing and recovery. Do not operate Team/subagent handles or manage a finalizer for this assignment. Host permissions still apply.
- Assigned researchers investigate directly, keep sources and all artifacts read-only, and use the supplied delegate.complete result contract once. Do not delegate again or mutate the parent plan.
- Recall remains tools.claw_run({operation: "search", args: {query: topic}}); use read/glob/grep for source inspection, never shell claw commands or forged host/session arguments.

These operations require the matching adapter version. If not advertised or rejected as unsupported, report that capability gap; do not reconstruct the orchestration in the model or switch hosts.

## Codex

Use the current native multi-agent tools. The established route is `list_agents`
→ suitable same-thread researcher via `followup_task`, otherwise `spawn_agent`
with `fork_turns: "none"`, then `wait_agent` for the result. If not exposed, use
`tool_search` when available to discover the current agent tools. Their live
argument schemas and permissions win over these spellings; do not invent tools
or bypass a real denial. Preserve narrow context, same-role reuse when supported,
and result-before-dependent-work. Read-only recall uses `claw search --query
"<topic>"` through the permitted Codex shell tool, without forged host/session
arguments. Search is not a plan mutation: the fixed code-mode driver accepts
context and plan/task/subplan commands, not search.

## Cindy

Selecting researcher for a bounded investigation within the user request
authorizes the corresponding Orca research assignment under Cindy policy; it
does not authorize unrelated Worker lifecycle changes. Keep disclosure before
each dispatch or reuse, then:

1. Call `cindy_orca.get_workspace_info`. Match only role exactly `researcher`.
   Prefer stable label `researcher`; otherwise reuse a sole unambiguous Worker
   of that role. If several match without the stable label, surface ambiguity
   instead of guessing or creating another Worker. Never repurpose a different
   role or send research to a `knowledge-finalizer`.
2. If no active workflow exists, call `cindy_orca.start_team`. If no matching
   Worker exists, call `cindy_orca.create_worker` with role and label
   `researcher`, an available agent, and `initial_task`. Leave model, effort and
   fast mode unspecified unless the user requests them. Otherwise call
   `cindy_orca.send_to_worker` with its session id as `target_session_id`.
   A busy matching Worker may queue work; do not create a duplicate for that.
3. Each independently executable brief has `Intent`, `Decisions`, `Boundaries`
   and `Task` sections, including read-only scope, repository state to preserve,
   loaded skill path/host route, exact question and expected output contract.
4. Accept only an explicit dispatched, queued, resumed or already-active
   response. Surface other outcomes immediately. After a successful dispatch,
   immediately end the current Lead turn: no normal user-facing reply, further
   tools, polling, or independent work. Resume dependent work only in the
   follow-up turn carrying the automatically delivered Worker report.
5. Keep a useful Worker for related research; archive it or end the team only
   when the user requests that lifecycle change.

The assigned Worker does the investigation directly, without delegation, and
sends one completed or blocked report using its supplied `send_to_lead` tool.
Use Ghost `list_tools` / `call_tool` for claw search; never translate a Ghost
operation into a shell command.

## OpenCode and standard hostless

An inline invocation may investigate directly. If the owning workflow delegates,
use the host native research/task surface with the narrow contract and wait for
the result; OpenCode can use its explorer-style `claw-researcher` agent. Reuse
only when supported. Do not create a deposition worker or change plan lifecycle.
OpenCode recall stays on its active adapter route. Standard hostless recall uses
`claw search --query "<topic>"` with the same exported `CLAW_SESSION_ID` for the
conversation, no `--host` or `CLAW_HOST`. An installed native adapter always wins.
