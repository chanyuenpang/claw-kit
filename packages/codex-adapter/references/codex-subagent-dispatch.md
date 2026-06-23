# Codex delegated subagent dispatch

Use this note when `workflowGuidance.delegateSubagents` is present.

## Core rule

`delegateSubagents` is not advisory prose. Each entry is a structured dispatch contract.

Codex has multi-agent capability. Use `tool_search` to locate the current session's agent-management tools, then execute delegation through that surface.

Only wait on a specialist when the entry says `waitForCompletion: true`.
When the current thread already has a suitable same-type specialist subagent, reuse it when the entry says `preferReuseSameTypeInThread: true`.

For deposition specialists, the default dispatch shape is:

- `agent_type: "worker"`
- `model` from `delegateSubagents[*].model`
- `fork_context` from `delegateSubagents[*].fork_context`
- include the exact `delegateSubagents[*].skill` item explicitly
- include only the narrow task bundle needed by that specialist

For investigation specialists:

- `agent_type: "explorer"`
- do not pin a model by default
- do not read the search skill inline
- include the corresponding `skill` item explicitly
- include only the narrow task bundle needed by that specialist

This plugin assumes Codex multi-agent support is part of the normal Codex environment. Use `tool_search` to locate the current session's subagent tools. Do not silently replace delegated review or deposition with a casual inline pass and then claim the subagent workflow happened.
Do not invent an extra "user must explicitly authorize delegation in this turn" gate. The user has already authorized the current `@claw-kit` thread to use required delegated specialists.
Do not block the workflow for any permission-related excuse, lack of a fresh authorization message, or similar delegation pretext. If the user explicitly changes direction and forbids delegation, follow that new instruction instead.
Do not document or implement inline fallback as a normal branch of the Codex adapter. Codex sessions should be treated as having real multi-agent capability.

## Dispatch order

Honor `workflowGuidance.nextsteps` ordering exactly.

- `truth-writer`
  - run at task-completion time before plan closure
  - keep the specialist open for reuse
- `adr-writer`
  - run when `all tasks done` guidance says retrospective is ready for ADR closeout
  - keep the specialist open for reuse
- `researcher`
  - run for investigation-first tasks or bounded analysis subtasks
  - reuse the current thread's suitable investigation specialist

## Reuse policy

- Prefer reusing an existing same-type subagent already active in the current Codex thread when it is still suitable for the same narrow specialist role.
- Spawn a new subagent when no such specialist exists, or when the existing one has drifted away from the required role.
- Reuse is a thread-level optimization to reduce context churn. It does not widen the bundle contract for any specialist.

## Discovery rule

- Codex has multi-agent capability.
- Use `tool_search` to locate the current session's agent-management tools.
- Do not hard-code exact tool names in workflow assumptions.

## Minimal bundles

Keep subagent bundles narrow. Do not dump the whole main-session context.

### `truth-writer`

Send:

- the skill item named by `delegateSubagents[*].skill`
- the completed subagent's task report, or an equivalent completed subtask report

Expected behavior:

- fire-and-forget deposition
- the main agent does not wait on a result before continuing the task lifecycle
- any returned payload is optional telemetry, not a required handoff contract

### `adr-writer`

Send:

- the skill item named by `delegateSubagents[*].skill`
- completed plan path
- completed plan JSON

Expected behavior:

- fire-and-forget deposition
- the main agent does not wait on a result before continuing
- any returned payload is optional telemetry, not a required handoff contract

### `researcher`

Send:

- the `claw-kit:researcher` skill item
- the exact investigation question
- any narrow target files, modules, or paths
- the `gitnexus` state when that matters

Expected behavior:

- use `claw search` first for project/truth/ADR recall
- use GitNexus-oriented capabilities when enabled and materially useful for code investigation
- return a compact findings bundle with anchors and recommended next step
- if the task is research, wait for completion
- do not skip ahead

## Main-agent responsibilities

- Reuse or spawn only the specialist needed by current `workflowGuidance`.
- For `truth-writer` and `adr-writer`, default to `worker + gpt-5.4-mini + explicit skill item`.
- For `truth-writer` and `adr-writer`, honor `fork_context: false` by avoiding full-history forked context and sending only the narrow deposition bundle.
- For `researcher`, default to `explorer + explicit skill item`.
- For `researcher`, do not read the search skill inline. Attach the `claw-kit:researcher` skill item and dispatch.
- Follow `waitForCompletion` directly instead of inferring wait behavior from prose.
- For research tasks, `waitForCompletion` should block the host. Do not continue past the research gate without the result.
- Follow `closePolicy` directly. `truth-writer` and `adr-writer` remain open for same-thread reuse.
- Apply the returned result back into canonical `.claw` state through `claw plan edit`, `claw truth ingest`, or follow-up user confirmation.
- Only close a deposition specialist when it is no longer useful for later same-type work in the thread.

## Anti-patterns

- Do not say "hand off to subagent" unless a subagent was actually spawned.
- Do not spawn unnecessary duplicate specialists when a same-type subagent in the current thread can be reused cleanly.
- Do not keep investigation work on the main agent when a narrow reusable researcher specialist would suffice.
- Do not let delegated truth or ADR work drift into generic docs writing.
- Do not merge truth deposition and ADR deposition into one catch-all worker.
