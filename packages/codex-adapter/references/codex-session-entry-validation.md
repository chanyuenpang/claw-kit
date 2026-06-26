# Codex session entry validation

Use this note when checking whether a fresh Codex thread entering a `.claw` project starts the right way.

## Expected behavior

When a session starts and its `cwd` resolves inside a `.claw` project:

1. Codex uses `using-claw-kit`.
2. `SessionStart` has already recovered startup harness state before `using-claw-kit` continues the workflow.
3. The first meaningful assistant message mentions recovered `.claw` state or explains that the request was judged low-complexity enough to skip the claw planning workflow.

When `@claw-kit` is explicitly invoked outside an existing `.claw` project:

1. Codex enters the normal claw-kit flow instead of reporting that no harness can be recovered.
2. Codex runs `claw context` to recover startup state for that explicit invocation.
3. If needed, `.claw/` is initialized or corrected before the agent continues.

## Good signs

- the first reply mentions `.claw`, task, or active plan
- the first reply explicitly says a low-complexity request will bypass `claw plan create`
- the agent recommends `claw plan create` when no task scope exists
- the agent reports current task state when a task already exists
- the agent initializes or corrects `.claw` instead of stopping on startup recovery errors

## Bad signs

- generic greeting with no harness state
- starting normal chat before startup recovery completes
- saying claw-kit cannot proceed because `.claw` is missing or malformed
- suggesting an alternate task-binding mechanism unrelated to `plan create` for work that still needs the formal claw workflow
