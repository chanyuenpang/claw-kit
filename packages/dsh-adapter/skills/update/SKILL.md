---
name: update
description: Use when a newer claw-kit version is available for DSH or the user asks to refresh the installed claw CLI and @veewo/dsh-adapter npm package.
---

# update

Use this skill to refresh claw-kit on the DSH host. The loaded adapter already
determines the platform; do not ask the user to choose a host route.

## Direct fallback

If the workspace has no `.claw` directory or claw-kit is unavailable, read
`non-claw-fallback.md` and follow the DSH update instructions directly. Do not
treat claw-kit as a prerequisite or claim that its unavailability prevents the
update from proceeding.

## Entry routing

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- When claw-kit is available, direct request: run
  `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "update"`.
- When claw-kit is available, active parent task: run
  `claw subplan create --parent <parent-task-name> --task-id <id>
  --template-file "<skill-dir>/TEMPLATE.json"` and consume its goal handoff so
  the active parent goal completes before the update subplan creates its own
  goal.
- When claw-kit is available, batch request: create one root task per target
  and run this template as the update task's subplan.

## Contract

- Refresh the published global claw CLI first, then the `@veewo/dsh-adapter`
  npm package into the DSH profile:
  ```powershell
  npm install -g @veewo/claw@latest
  dsh plugin --profile <name> add @veewo/dsh-adapter@latest
  ```
- Treat the CLI and the adapter as **one update unit**; verify both before
  reporting success. The installed CLI must accept `--host dsh`
  (`SUPPORTED_CLAW_HOSTS` includes `dsh`) — a CLI without the dsh host support
  cannot drive the adapter.
- Never use unpublished workspace files as the update source; use the npm
  registry (or the published GitHub source when separately authorized).
- A new package version alone is not activation proof. The adapter activates
  only after the DSH Host restarts and a real session mounts `claw_run`.
  Verify: `claw --version` is the target, `dsh --profile <name> --dump-config`
  shows the `claw-adapter` row, and after restart the `claw_run` tool and the
  six bundled skills (using-claw-kit / researcher / planning / config /
  create-claw-skill / claw-kit-doc) are present.
- Keep execution details in `TEMPLATE.json`; use `non-claw-fallback.md`
  whenever the claw harness is unavailable.

## References

- Fallback: `non-claw-fallback.md`
- Template: `TEMPLATE.json`
