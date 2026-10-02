# Update claw-kit on DSH — fallback route (no claw planning)

If claw planning is unavailable, update the DSH install directly. First resolve
the current authorized profile as `<name>`; ask if unknown and never default to
`web`. Installation and restart are separate boundaries.

1. **Detect versions:**

   ```powershell
   claw --version
   npm view @veewo/claw version
   npm view @veewo/dsh-claw-kit version
   ```

   Read the installed adapter version. For a non-Electron profile,
   `dsh --profile <name> --dump-config` confirms the `claw-kit` row. For the
   Electron-managed `desktop` profile that command is refused; read
   `%USERPROFILE%\.dsh\profiles\<name>\node_modules\@veewo\dsh-claw-kit\package.json`
   or list the profile's bundles through `plugin_manager`.

2. **Update the global claw CLI:**

   ```powershell
   npm install -g @veewo/claw@latest
   # After restarting DSH, verify host-scoped recovery through:
   # claw_run(operation: "context", args: {})
   ```

3. **Update the DSH adapter in the profile.** The write path depends on who
   owns the profile:

   - **Non-Electron profile (`web`, `headless`, custom names):**

     ```powershell
     dsh plugin --profile <name> add @veewo/dsh-claw-kit@<exact-version>
     dsh --profile <name> --dump-config   # claw-kit row present
     ```

   - **Electron-managed `desktop` profile:** the installed global `dsh` on
     `PATH` refuses every operation with
     `error: profile "desktop" is managed exclusively by the Electron application`,
     so no `dsh plugin --profile desktop …` form can work. Use the profile's own
     plugin manager, the same service as the Desktop app's **Plugins** page:

     ```text
     plugin_manager(action: "install_bundle", target: "<spec>")
     ```

     `target` accepts the exact published version, an absolute local path, or a
     tarball. A local path or tarball skips the registry release-age quarantine;
     a just-published registry version is quarantined by the profile's
     `minimumReleaseAge`. Never write profile files with a filesystem tool,
     script, or shell — that bypasses the manager and cannot be rolled back.
     Confirm the result through `plugin_manager(action: "list_bundles")`.

   With the app fully quit, the packaged Desktop CLI is an equivalent fallback;
   see `references/desktop-profile-write-boundary.md` for the exact invocation.

4. **Verify activation after an authorized restart:** restart the DSH profile
   only with explicit restart authorization; otherwise report the on-disk
   installation and defer activation. Then confirm `claw_run` and all skills
   declared by the installed package appear, and run a
   `claw_run(operation: "context", args: {})` recovery smoke check when
   appropriate.

Treat the CLI and the adapter as one update unit — verify both before reporting
success. Use the npm registry as the default source; a local tarball is only
valid when the release workflow authorizes that exact artifact for the target
profile.
