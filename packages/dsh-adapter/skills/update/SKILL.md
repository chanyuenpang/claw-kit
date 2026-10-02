---
name: update
description: Use when a newer claw-kit version is available for DSH or the user asks to refresh the installed claw CLI and @veewo/dsh-claw-kit npm package.
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

- When claw-kit is available, direct request: call `claw_run` operation
  `plan.create` with `template_file: "<skill-dir>/TEMPLATE.json"` and `title: "update"`.
- When claw-kit is available, active parent task: call `claw_run` operation
  `subplan.create` with `parent`, `task_id`, and the same absolute `template_file`.
  The adapter consumes Goal/progress effects; do not call goal tools or run
  plan/task/subplan mutations in a shell.
- When claw-kit is available, batch request: create one root task per target
  and run this template as the update task's subplan.

## Contract

- Refresh the published global claw CLI first:
  ```powershell
  npm install -g @veewo/claw@latest
  ```
- Then update `@veewo/dsh-claw-kit` in the authorized profile according to its
  owner. For a non-Electron-managed profile such as `web`, use the
  profile-scoped CLI: `dsh plugin --profile <name> add
  @veewo/dsh-claw-kit@<exact-version>`.
- For the Electron-managed `desktop` profile, the installed global `dsh` on
  `PATH` refuses every operation with `profile "desktop" is managed exclusively
  by the Electron application`, so `dsh plugin --profile desktop …` and
  `npm run install:dsh-plugin --profile desktop` cannot work. Use the profile's
  own plugin manager instead:
  `plugin_manager(action: "install_bundle", target: "<exact-version spec, local
  tarball path, or package path>")`, which is the same service as the Desktop
  app's **Plugins** page. Never write profile files with a filesystem tool,
  script, or shell. A rejection that names Electron is this boundary, not a
  broken command. Read `references/desktop-profile-write-boundary.md` for the
  verified commands, the app-quit fallback, and the verification steps.
- Treat the CLI and the adapter as **one update unit**; verify both before
  reporting success. The installed CLI must accept `--host dsh`
  (`SUPPORTED_CLAW_HOSTS` includes `dsh`) — a CLI without the dsh host support
  cannot drive the adapter.
- Never use unpublished workspace files as the update source; use the npm
  registry (or the published GitHub source when separately authorized). A local
  tarball is acceptable only when the release workflow explicitly authorizes
  that exact published-equivalent artifact for the target profile.
- Resolve the authorized current profile; ask if unknown rather than assuming `web`.
- A new package version alone is not activation proof. Restart requires separate
  explicit authorization; otherwise defer activation checks until the owner
  restarts and a real session mounts `claw_run`.
  Verify: `claw --version` is the target, the profile lists the new bundle
  version (`plugin_manager(action: "list_bundles")` for the `desktop` profile;
  `dsh --profile <name> --dump-config` shows the `claw-kit` row for profiles that
  command accepts), and after restart the `claw_run` tool and the bundled skills
  declared by the installed package are present, including feature-architecture
  and knowledge-capture; do not rely on an old fixed count.
- Keep execution details in `TEMPLATE.json`; use `non-claw-fallback.md`
  whenever the claw harness is unavailable.

## References

- Desktop profile write boundary: `references/desktop-profile-write-boundary.md`
- Fallback: `non-claw-fallback.md`
- Template: `TEMPLATE.json`
