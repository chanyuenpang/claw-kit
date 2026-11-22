# OpenCode hooks strategy

Canonical plans and bindings belong to Core, not event guesses or directory scans.

- session.created (properties.info.id) and session.compacted (properties.sessionID) recover context with the actual session identity.
- chat.message lazily recovers when events were missed. Context and injection caches are plugin-instance/session-local. A newly appearing .claw invalidates the cache.
- experimental.chat.system.transform adds the same session-bound startup guidance.
- An uninitialized workspace still gets entry guidance. Context does not initialize it; plan.create or explicit init owns initialization. Small tasks may run directly.
- message.updated and message.part.updated track final assistant text per session. session.idle captures the turn through Core auto-doc and dispatches a queued writer through native session.create/promptAsync.
- Bound writer children skip ordinary startup guidance, capture and continuation. Their own shell environment carries finalizer identity; other sessions are unaffected.
- Recovery logs the canonical finalization status and durable delivery state, never infers success from accepted delivery and never resends an uncertain attempt.

## Continuation

Only the current session-bound process.active plan can continue. A changed task resets the unchanged-turn count. Two unchanged task endings pause automatic continuation locally, without mutating canonical plan state. SDK rejection or unknown send pauses immediately, with no automatic resend. Waiting, discussing and terminal plans never continue.

Plugin capture/dispatch failures remain observable side failures, not reasons to roll back plan completion. The native writer runs in the current OpenCode service, not another opencode process. See [closeout](opencode-knowledge-closeout.md).
