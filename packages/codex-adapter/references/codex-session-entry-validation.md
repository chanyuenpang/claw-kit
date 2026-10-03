# Codex session entry validation

Use this note when checking whether a fresh Codex thread entering a `.claw` project starts the right way.

## Expected behavior

When a session starts and its `cwd` resolves inside a `.claw` project:

1. Codex uses `using-claw-kit`.
2. `SessionStart` recovery is consumed when present; if it is missing or diagnostic-only, `using-claw-kit` performs context recovery through the fixed driver.
3. The assistant follows the recovered guidance without a ceremonial status message or extra `plan sync`.

When `@claw-kit` is explicitly invoked outside an existing `.claw` project:

1. Codex enters the normal claw-kit flow instead of reporting that no harness can be recovered.
2. Codex runs context recovery through the fixed code-mode driver with `argv: ["context"]`, never through a direct CLI call or a hand-written `--host` flag.
3. If needed, `.claw/` is initialized or corrected before the agent continues.

## Good signs

- the agent performs the necessary owner call without extra status ceremony
- the agent distinguishes direct work from an explicit `--no-knowledge-capture` opt-out: no reusable project knowledge bypasses the formal workflow, while session storage remains a separate lifecycle decision
- the agent recommends `claw plan create` when reusable project knowledge is expected and no task scope exists
- the agent allows a created plan to remain in `process.discussing` until downstream tasks are explicit and handoff-ready
- the agent reports current task state when a task already exists
- the agent initializes or corrects `.claw` instead of stopping on startup recovery errors

## Bad signs

- performing a plan mutation before recovery establishes the canonical target
- treating SessionStart/version/projection diagnostics as permission to replay or replace a canonical mutation
- saying claw-kit cannot proceed because `.claw` is missing or malformed
- suggesting an alternate task-binding mechanism unrelated to `plan create` for work that still needs the formal claw workflow
