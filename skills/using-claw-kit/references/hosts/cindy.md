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

The Cindy adapter uses the supported `will-user-message` hook's `event-verdict`
rewrite to append its host identity and requirement to use the claw workflow for
development only on the first eligible message in each session. A persistent
session receipt prevents repetition after plugin restart; later messages pass
unchanged. It preserves the user text and performs no network or workflow
operations in this hook. If the rewritten text would exceed the
Host's 16,000-character limit, it allows the original message unchanged; use the
native catalog/result identity in that case. Session-created background work is
still asynchronous. There is no `additionalContext` injection channel here.

## Cindy Orca agents

In Cindy, every claw-kit delegation uses the corresponding Orca Agent, exposed
by the Host as an Orca Worker. Apply the requested task scope, authorization,
model, effort, and asynchronous completion semantics directly to the Orca Agent
lifecycle.

## Knowledge finalizer dispatch

A terminal plan returns a source-plan `knowledgeDispatch` for one fresh,
UI-visible Orca `knowledge_finalizer` Worker. It is authorization for that
handoff, not another job to claim. Discover the actual Orca tools when needed;
if there is no team, use `start_team`, then `create_worker` with the complete
prompt as `initial_task`, agent `codex`, and a label based on `dispatchId`.
Use supported model/effort fields as preferences, not catalog-based admission
gates. Report actual owner failures; do not resend an accepted or uncertain
creation or send the handoff to multiple workers.

The Worker calls Ghost `knowledge.materials` with `sourceSessionKey` and
`sourcePlan`. This reads the complete plan and its ordinary conversation and
provides an ordinary non-capturing auxiliary plan and knowledge subplan template.
The Worker judges that evidence, may search for context, and finishes through
those ordinary plans. No claim, token, receipt, lease, or separate result
registration is required. A read failure is a diagnostic, not fabricated empty
history or a new completion gate.

After Worker creation is accepted, finish the Lead's normal response without
waiting or polling. Acceptance is not proof of document completion. Do not run
the finalizer in the Lead, through an errand, or from a turn-end hook. Old jobs
are not automatically scanned, resumed or rewritten.

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
