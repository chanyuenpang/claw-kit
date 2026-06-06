# Codex session entry validation

Use this note when checking whether `@claw-kit` starts the right way in a fresh Codex thread.

## Expected behavior

When the plugin is invoked in a `.claw` project:

1. Codex uses `using-claw-kit`.
2. `using-claw-kit` recovers `.claw` context directly without relying on a legacy bootstrap alias.
3. The first meaningful assistant message mentions recovered `.claw` state rather than a generic greeting.

## Good signs

- the first reply mentions `.claw`, task, or active plan
- the agent recommends `claw plan write` when no task scope exists
- the agent reports current task state when a task already exists

## Bad signs

- generic greeting with no harness state
- starting normal chat before recovering `.claw` context
- suggesting an alternate task-binding mechanism unrelated to `plan write`
