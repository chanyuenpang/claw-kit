# OpenCode session entry

Use this note when reasoning about how claw-kit enters an opencode session.

## Entry surfaces

The opencode adapter plugin (`packages/opencode-adapter/plugin/index.ts`) establishes claw context through three coordinated surfaces:

1. `event(session.created)` + `event(session.compacted)` — calls `claw hook auto-claw --host opencode` and caches the returned `additionalContext`. Compaction re-runs because the prior system prompt injection is lost when the context window is compressed.
2. `chat.message` — prepends the cached claw context as a synthetic text part to the session's first user message. LLMs attend to user messages far more strongly than system prompts, so this is the primary injection. Guarded by `injectedSessions` so it only fires once per session.
3. `experimental.chat.system.transform` — pushes the cached claw context into the system prompt as a compaction fallback.

## Default routing

- session-bound active workflow recovered: treat the recovered `workflowGuidance` as the only next-step contract; the recovered payload includes current plan content so the resumed agent can continue without reopening the plan.
- no recovered harness state yet: run `claw context` from the current working directory to recover startup state.
- no task scope: create or bind one with `claw plan create` when reusable project knowledge is expected; otherwise work directly.
- newly created planning-enabled task: starts in `process.discussing` and may remain there across turns; bridge into `process.active` only after downstream tasks are explicit and the user can hand off execution.

## Non-goals

- Do not depend on plugin events for canonical correctness.
- Do not branch startup recovery by event source; use one startup flow and decide only from recoverable workflow or project state.
- Do not auto-initialize arbitrary repos in the background.
