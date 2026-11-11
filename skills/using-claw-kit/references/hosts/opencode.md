# OpenCode execution route

Consume the adapter's session-start/compact recovery first. If no recovered
harness state is available, run `claw context` from the current workspace.
Recover only through session binding, never directory scans or event guesses.
After the common entry gates, use the owning template or
`claw plan create "<title>"` for a new generic plan. Run CLI operations
through the OpenCode host's supported command tool and follow returned
`workflowGuidance`; do not import the Codex Goal/code-mode bridge.

## Knowledge closeout

The default background route belongs to the plugin/worker, not the main agent.
The plugin captures the turn on session.idle; its host-aware worker uses
native `client.session.create` and `client.session.promptAsync` in the current
OpenCode service, not a second CLI process or a Lead-spawned worker. The foreground canonical
transition resumes the parent binding or clears the root binding without
waiting for the report or writer.

Do not manually judge, duplicate, or dispatch the background writer. A plugin,
report, or worker failure must remain observable but cannot roll back a settled
canonical transition. Do not repeat plan completion as compensation. Async
writer completion and successful foreground plan.done are different evidence.

OpenCode always captures at idle and launches its adapter-owned writer when a canonical target exists; writer children are excluded. Delivery is persisted before external effects, and uncertain delivery is never automatically resent. Execution depends on the current OpenCode service remaining alive; accepted dispatch is not a completed knowledge receipt.
