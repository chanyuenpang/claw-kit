# Cindy execution route

## Select the advertised Cindy transport

Use trusted active-plugin/runtime context, not model family or a stale model
label in a session snapshot. Use the Cindy claw-kit Ghost gateway for every
workflow operation. Do not select the Codex driver or a shell workflow route
because the current model is Codex. If Ghost is not advertised or a call fails,
surface that boundary and continue ordinary work without fabricating a workflow
mutation; never fall back from a failed Ghost call to shell.

## Host identity confirmation

The native Cindy Ghost catalog and operation results declare `platform: cindy`
through `[claw host]` text or `clawHost.platform`, independently of model/provider.
When no startup marker is available, confirm that native catalog before the first
workflow mutation. Do not use a remotely connected tool to override a different
current session's trusted host marker.

The current Cindy adapter has no verified first-turn hook prompt injection
channel: session-created work is asynchronous and does not deliver model prompt
context. Use the supported native catalog/result declaration; do not invent a
will-user-message/additionalContext response or claim startup injection occurred.

## Cindy Orca agents

In Cindy, every claw-kit delegation uses the corresponding Orca Agent, exposed
by the Host as an Orca Worker. Apply the requested task scope, authorization,
model, effort, and asynchronous completion semantics directly to the Orca Agent
lifecycle.

## Knowledge finalizer dispatch

For subagent policy, Cindy
uses one knowledge-closeout execution model: a persistent, UI-visible Orca
Worker. When a terminal plan mutation returns a valid `knowledgeDispatch`,
dispatch that Worker directly.
That `knowledgeDispatch` is the claw-kit Orca authorization for the exact
`knowledge_finalizer` lifecycle below; no separate user confirmation is
required. It does not authorize any other Worker. The dispatch is always
executed by the Orca Agent in Cindy. The job already exists durably when the
terminal mutation returns; neither dispatch nor report capture waits for a Stop
hook.

**Orca discovery is required.** When `knowledgeDispatch` is present, dispatch
it through Cindy Orca. If `cindy_orca` is absent from a static tool list,
discover `mcp__cindy_orca__*` from `ALL_TOOLS`, then call
`get_workspace_info`. Only an actual Orca call failure makes dispatch
unavailable; never substitute shell, background work, or an unsupported claim.

1. Do not reuse a `knowledge_finalizer` Worker. Each `finalizeId` owns one
   isolated Worker so a stale claim can never receive a later job.
2. If no active workflow exists, call `cindy_orca.start_team`, then create the
   Worker with `cindy_orca.create_worker`, role `knowledge_finalizer`, label
   `knowledge_finalizer_<first 12 chars of finalizeId>`, agent `codex`, and
   the complete `knowledgeDispatch.prompt` as `initial_task`.
3. If the workflow exists, create that same uniquely labelled Worker. Do not
   send a later dispatch to an existing Worker.
4. Map supplied `model` and `reasoningEffort` to Worker creation only when the
   Host advertises them as valid for the Codex Worker. Do not replace an
   unsupported configured model silently.
5. Treat only a newly created or queued Worker as accepted asynchronous
   dispatch. An unavailable, failed, or expired claim is terminal for that
   Worker: end or archive it rather than retrying or reusing it. Immediately finish the main response after that acknowledgement.
   Do not wait for the Worker. Do not poll, read the Worker output, query its
   status, or describe the finalization as an unfinished foreground step. The Worker uses the
   `knowledge.claim` operation in the returned prompt to capture task
   conclusions and claim the existing job atomically.

**Lead turn boundary:** an accepted Orca Writer dispatch is the terminal action
of the current Lead turn. Return the normal user-facing completion response
immediately after the fresh `create_worker` acknowledgement. The
Writer's report belongs to its own asynchronous turn and must not delay,
resume, or extend this Lead turn.

Never execute the returned finalizer prompt in the Lead, send it through
`cindy.agent.errand`, or let a did-turn-end hook create or claim a Cindy
knowledge job. Legacy Cindy background jobs remain visible for diagnosis but
are not launched.

---

## No Codex-driver fallback

Cindy uses its own Ghost command gateway. Do not call the Codex code-mode
driver from Cindy: `claw codex invoke` unconditionally binds host=codex and
cannot preserve Cindy session ownership. A Codex model inside Cindy is still
platform cindy. Historical shell + Codex bridge instructions are superseded.
If the native Ghost gateway is unavailable or runtime instructions conflict
with this host identity, report the capability conflict; do not execute a
wrong-host mutation or append host/session flags by hand.

## Ghost tool path (default)

### Canonical state

- The `.claw/` project, task, and plan files are the source of truth.
- Cindy Progress/Todo and Goal are Host-owned optional presentation surfaces;
  never treat them as a second plan database or attempt to operate them.
- The Ghost Node Worker owns `claw` discovery, `--host cindy`, session binding,
  command execution, and lifecycle projection. Do not run `claw` shell
  commands, supply host/session arguments, or request a plan sync.

### Session entry

1. Read the workflow snapshot injected by the Cindy Host at session start (or
   after Host-managed compact recovery).
2. If the Host reports that claw is unavailable, surface its actionable
   diagnosis, skip claw-kit, and continue the user's task directly without
   pretending that recovery succeeded.
3. When an active session-bound plan is recovered, continue it unless the
   current user request explicitly changes, replaces, or cancels its goal.
   Record that revision through the supported workflow before proceeding.

Only the Host invokes `claw context`, and only for session start or compact
recovery. It is never a turn-end status probe.

### Planning and execution

- Use the Ghost tools in this exact order:
  1. Refresh the Ghost list and identify the `claw-kit` plugin. Do not search
     MCP resources or discover server names.
  2. Invoke its `list_tools` with no `category` to get the category overview.
  3. Invoke that same `list_tools` again with the selected `category` to get
     operation names and argument schemas.
  4. Invoke `call_tool` with one of those operation names and its JSON
     arguments. Never pass `list_tools` itself as `call_tool.name`.
- `call_tool` receives Host-forged `args.session_context` automatically. It
  identifies the current Cindy session and workspace (`session_id`, `workdir`,
  `workdir_is_local`, and `workdir_is_read_only`) so the plugin can execute in
  the right project without accepting agent-supplied identity or paths. Do not
  add, reconstruct, or override this field.
- If a catalog call succeeds but `call_tool` returns a generic Host error, do
  not fall back to shell commands or fabricate session context. Surface the
  recoverable failure; the Host must deliver the trusted context before a
  workflow operation can run.
- Follow the returned Cindy `guidance` object. Its `commandHints` are
  equivalent `call_tool` instructions: invoke the given operation name and
  JSON arguments, and fill any listed `requiredArgs` before calling.
- Apply the common lifecycle in the entry skill; dispatch only when returned
  guidance supplies the applicable knowledge handoff.
- Keep low-complexity work lightweight when claw guidance says a full plan is
  unnecessary.

Do not request manual host actions, plan synchronization, or Goal Mode. Keep
internal Worker lifecycle details out of ordinary user replies.

### Completion

When all plan tasks are complete:

1. Complete the canonical plan transition through `call_tool`.
2. If the terminal result contains a `knowledgeDispatch`, dispatch it through
   the Orca flow above before returning the normal final response.
3. Do not wait for a Stop hook or for the Writer to finish. Once dispatch is
   accepted, return the main reply immediately without polling or reading the
   Worker; do not manually trigger sync or Goal handling.

Knowledge closeout must remain bounded to the current project and plan. A
failure must be visible and recoverable; never silently mark a failed closeout
as complete.

## Main-agent policy boundary

A main-agent closeout is not an Orca dispatch and creates no job/report/worker.
Follow the returned assignment route only if it is supported by the selected
transport. In particular, do not invent missing Ghost prepare/complete
operations or switch to shell to satisfy CLI-shaped guidance. Surface an
unsupported route without claiming closeout success. Never substitute the
public manual knowledge-capture skill for automatic finalization.
