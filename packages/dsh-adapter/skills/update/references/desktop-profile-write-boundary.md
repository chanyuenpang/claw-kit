# DSH Desktop profile write boundary

Verified 2026-10-02 against the installed DSH Desktop app (`@deepseek-ai/dsh-desktop`
`0.2.0-rc.2`, bundled pnpm `11.7.0`) and the `desktop` profile under
`$DSH_HOME\profiles\desktop` (`~\.dsh\profiles\desktop`).

## Why direct edits fail

The Desktop app owns its reserved profile. Two independent guards reject the
usual write paths:

- The packaged `dsh` CLI keeps the refusal in the shared launcher
  (`@deepseek-ai/dsh/lib/bin.js`): `rejectElectronProfile` errors with
  `error: profile "desktop" is managed exclusively by the Electron application`.
  The packaged Desktop CLI passes `manageDesktopProfile: true` when it forwards
  to that launcher, so `dsh plugin --profile desktop …` starts pnpm, while
  `runProfile`, `--dump-config`, and `--dump-default-config` stay refused for it.
- The **installed global** `dsh` on `PATH` is a different build (for example
  `0.1.5-rc.2`) and rejects `desktop` for every command, including
  `plugin`. It also forwards to the PATH pnpm (`10.x`), not the Desktop
  runtime's pnpm (`11.7.0`).

Writing `profiles\desktop\package.json` or `node_modules` with a filesystem
tool, script, or shell is not a substitute: it bypasses the manager, so
`dsh.profile.bundles` is not reconciled, the lockfile is not verified against
the profile's supply-chain policy, and a failed write cannot be rolled back.

**A rejection that names Electron is this boundary, not a broken command.** Stop
retrying file writes and use one of the two supported paths below.

## Preferred path: the profile's own plugin manager

The Desktop app's plugin manager is the single supported writer for its profile;
the in-app **Plugins** page and the agent `plugin_manager` tool call the same
service. Install or update the adapter with:

```text
plugin_manager(action: "install_bundle", target: "<spec>")
```

- `target` is any install spec the manager accepts: a registry name
  (`@veewo/dsh-claw-kit@0.2.42-rc.0`), an absolute local path, or a tarball.
- A local path or tarball is resolved outside the registry trust boundary, so
  pnpm's release-age quarantine (`minimumReleaseAge: 1440` in the profile's
  `pnpm-workspace.yaml`) does not apply. A just-published registry version is
  quarantined for a day unless the profile explicitly excludes it.
- The action requires `danger-full-access` for that call. Approval does not
  change the session permission mode. If pnpm blocks dependency build scripts,
  the failure lists `pendingBuilds`; pass them through `approvedBuilds` only
  after the user approves those scripts in the conversation.
- The call reports `application: "restart-required"` for this profile. Check it
  with `list_bundles`; the changed bundle shows its new version and
  `"rows": [{"rowId": "claw-kit", …}]`.

From the repository the current adapter tarball is
`dist/dsh-plugin/veewo-dsh-claw-kit-<npm-version>.tgz`, produced by
`npm run export:dsh-plugin` (or by the release's dry-run staging).

## Fallback path: the packaged Desktop CLI, with the app fully quit

`npm run install:dsh-plugin` runs the **global** `dsh` on `PATH`, so it works
only for non-Electron profiles such as `web`. For the Desktop profile, invoke
the app's own CLI entry directly. The app must be fully quit first: the plugin
manager takes an exclusive lock on the profile, and a running app keeps the old
plugin tree in memory.

```powershell
$appRoot = 'H:\Program Files\Deepseek'   # folder containing 'DeepSeek Harness.exe'
$exe     = Join-Path $appRoot 'DeepSeek Harness.exe'
$cli     = Join-Path $appRoot 'resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'

$env:ELECTRON_RUN_AS_NODE = '1'
& $exe $cli plugin --profile desktop add 'G:\Projects\claw-kit\dist\dsh-plugin\veewo-dsh-claw-kit-0.2.42-rc.0.tgz'
```

- `$appRoot\resources\runtime\pnpm\bin\pnpm.mjs` is the package manager this
  path uses; it is pnpm 11.7.0, matching the app runtime.
- Set `DSH_HOME` only to target a different DSH home; it defaults to `~\.dsh`.
- Read-only inspection is safe while the app runs:
  `& $exe $cli plugin --profile desktop list --depth 0` and
  `& $exe $cli plugin --profile desktop version-exemptions`.
- `& $exe $cli --profile desktop --dump-config` stays refused; verify the
  composed rows through `plugin_manager(list_bundles)` instead.

## Installation is not activation

Installation rewrites the profile on disk. The already-running Host keeps the
old module in memory, so a new adapter version mounts only after the app
restarts, and a client half (for example a settings section) needs that restart
or a window reload. Do not claim the running GUI uses the new version, and do
not restart a running Host without separate explicit authorization.
