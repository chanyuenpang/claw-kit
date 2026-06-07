# Codex session entry validation

Use this note when checking whether a fresh Codex thread entering a `.claw` project starts the right way.

## Expected behavior

When a session starts and its `cwd` resolves inside a `.claw` project:

1. Codex uses `using-claw-kit`.
2. `using-claw-kit` recovers `.claw` context directly without relying on a legacy bootstrap alias.
3. The first meaningful assistant message mentions recovered `.claw` state rather than a generic greeting.

When `@claw-kit` is explicitly invoked outside an existing `.claw` project:

1. Codex runs `claw context`.
2. `claw context` initializes `.claw` automatically.
3. Codex enters the normal claw-kit flow instead of reporting that no harness can be recovered.

## Good signs

- the first reply mentions `.claw`, task, or active plan
- the agent recommends `claw plan write` when no task scope exists
- the agent reports current task state when a task already exists
- the agent initializes or corrects `.claw` instead of stopping on bootstrap errors

## Bad signs

- generic greeting with no harness state
- starting normal chat before recovering `.claw` context
- saying claw-kit cannot proceed because `.claw` is missing or malformed
- suggesting an alternate task-binding mechanism unrelated to `plan write`
