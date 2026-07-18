# Codex Prompt-Driven Bootstrap

## Status

Accepted working truth for the current Codex adapter.

## Core facts

- Prompt-driven startup remains the primary Codex entry path for `claw-kit`.
- `SessionStart` can enhance startup context, but it does not replace the prompt-driven harness contract.
- The agent should still enter through `claw-kit:using-claw-kit`.
- Normal planned task scope is established through `claw plan create`; project-plan admission and direct-work routing are owned by `using-claw-kit-session-entry.md`.
- Project plan creation records a project-level session binding from the current `sessionKey` to a `.claw`-relative `planPath`; active workflow identity no longer lives in per-task `ownerSessionKey` metadata.
- `SessionStart` uses the current `.claw` state to attempt session-bound active workflow recovery before falling back to the default startup prompt.
- When recovery succeeds, startup injects only a minimal claw workflow snapshot plus recomputed `workflowGuidance`.
- The injected `workflowGuidance` is the only next-step contract that the agent should follow after recovery.
- Prompt-injected recovery guidance remains owned by the startup surface. `using-claw-kit` does not inspect it in its default `First Action`; the current entry route is owned by `codex-plugin-workflow-mechanics.md`.
- Recovery does not depend on hook source labels such as `startup`, `resume`, or `compact`; it depends only on recoverable `.claw` context.
- When recovery does not succeed, the default startup prompt should stay compact: identify the `.claw` project, point to `using-claw-kit`, and avoid extra status-reporting noise such as project-root or protocol-check lines. Goal lifecycle comes from returned guidance; knowledge finalization is hook-owned and must not be advertised as main-thread delegated writer authorization.

## Practical implications

- Startup behavior stays prompt-driven rather than hook-driven.
- Hooks may restore minimal workflow context, but they do not replace project plan creation, later plan mutations, or hook-owned knowledge finalization.
- If startup cannot resolve the current session through the explicit project-level binding, the adapter should continue with the normal startup prompt and let the standard workflow re-establish scope; it must not scan task directories to infer an active plan.
- The normal startup prompt may carry Goal lifecycle guidance, but it must not authorize or advertise `truth-writer` / `adr-writer` delegation; current knowledge finalization is hook-owned and outside the foreground startup contract.
- Future changes should keep recovery logic aligned with canonical plan state and `workflowGuidance`, not ad hoc prompt text or event-specific branching.
- Non-claw project initialization now has a dedicated `claw-kit:init` skill.
- The visible init action for that skill is an explicit `claw context` call from the target project root, so initialization remains a concrete workflow step rather than an implicit bootstrap side effect.
