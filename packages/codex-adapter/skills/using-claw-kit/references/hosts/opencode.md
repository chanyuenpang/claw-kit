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
`opencode run --agent claw-knowledge-writer` in the user's OpenCode
runtime, not Codex SDK or a Lead-spawned Codex worker. The foreground canonical
transition resumes the parent binding or clears the root binding without
waiting for the report or writer.

Do not manually judge, duplicate, or dispatch the background writer. A plugin,
report, or worker failure must remain observable but cannot roll back a settled
canonical transition. Do not repeat plan completion as compensation. Async
writer completion and successful foreground plan.done are different evidence.

For explicitly configured main-agent policy, execute the returned
prepare/complete assignments yourself from memory, with no report, transcript,
job, or delegation. This is automatic closeout, not the public manual capture
skill. OpenCode does not support the native subagent finalization policy.
