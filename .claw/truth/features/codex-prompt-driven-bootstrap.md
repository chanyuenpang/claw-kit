# Codex Prompt-Driven Bootstrap

## Status

Accepted working truth for the current Codex adapter.

## Core facts

- Prompt-driven startup remains the primary Codex entry path for `claw-kit`.
- `SessionStart` can enhance startup context, but it does not replace the prompt-driven harness contract.
- The agent should still enter through `claw-kit:using-claw-kit`.
- Task scope is still established through `claw plan write`.
- `plan write` now binds the active task to the current host session with `ownerSessionKey` and `boundAt`.
- `SessionStart` uses the current `.claw` state to attempt session-bound active workflow recovery before falling back to the default startup prompt.
- When recovery succeeds, startup injects only a minimal claw workflow snapshot plus recomputed `workflowGuidance`.
- The injected `workflowGuidance` is the only next-step contract that the agent should follow after recovery.
- Recovery does not depend on hook source labels such as `startup`, `resume`, or `compact`; it depends only on recoverable `.claw` context.
- When recovery does not succeed, the default startup prompt should stay compact: identify the `.claw` project, point to `using-claw-kit`, state that Goal mode and required delegated subagents including `truth-writer` and `adr-writer` are already authorized in the current thread, and avoid extra status-reporting noise such as project-root or protocol-check lines.

## Practical implications

- Startup behavior stays prompt-driven rather than hook-driven.
- Hooks may restore minimal workflow context, but they must not replace `claw plan write`, `claw plan edit`, `claw plan done`, truth deposition, or ADR deposition.
- If startup cannot recover an active plan bound to the current session, the adapter should continue with the normal startup prompt and let the standard workflow re-establish scope.
- The normal startup prompt may carry thread-local authorization semantics for Goal mode and delegated specialists such as `truth-writer` and `adr-writer` when that avoids false blocking in the Codex adapter.
- Future changes should keep recovery logic aligned with canonical plan state and `workflowGuidance`, not ad hoc prompt text or event-specific branching.
