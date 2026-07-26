# Qoder session entry

Use this note when reasoning about how claw-kit enters a Qoder session.

## Entry surfaces

The claw-kit Qoder plugin registers hook handlers that automate session entry:

1. **SessionStart hook** — fires at session start (startup, resume, clear, compact, new). Calls `claw hook auto-claw --host qoder` and injects the returned `additionalContext` into the conversation. This carries the full workflow guidance, skill loading directives, and active plan recovery.

2. **Stop hook** — fires when the agent finishes responding. Calls `claw hook auto-doc --host qoder` with the turn's `last_assistant_message` to append a fail-open knowledge report entry.

## Hook configuration

Hooks are declared in `hooks/hooks.json` and activated when the plugin is installed. The hook configuration follows Qoder's standard hook format:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume|clear|compact|new",
      "hooks": [{ "type": "command", "command": "claw hook auto-claw --host qoder" }]
    }],
    "Stop": [{
      "hooks": [{ "type": "command", "command": "claw hook auto-doc --host qoder" }]
    }]
  }
}
```

## Default routing

- session-bound active workflow recovered: treat the recovered `workflowGuidance` as the only next-step contract; the recovered payload includes current plan content so the resumed agent can continue without reopening the plan.
- no recovered harness state yet: run `claw context` from the current working directory to recover startup state.
- no task scope: create or bind a project plan when reusable project knowledge is expected; use `claw plan create "<title>" --scope session` when the plan/skill harness is useful but project deposition is not; otherwise work directly.
- newly created planning-enabled task: starts in `process.discussing` and may remain there across turns; bridge into `process.active` only after downstream tasks are explicit and the user can hand off execution.

## Environment setup

The `CLAW_HOST=qoder` environment variable is resolved from the hook command's `--host qoder` flag. The claw CLI uses this to select host-specific routing for knowledge finalization and workflow guidance.
