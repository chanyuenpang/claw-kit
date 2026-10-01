# Update claw-kit on DSH — fallback route (no claw planning)

If claw planning is unavailable, update the DSH install directly. First resolve the current authorized profile as `<name>`; ask if unknown and never default to `web`. Installation and restart are separate boundaries:

1. **Detect versions:**
   ```powershell
   claw --version
   npm view @veewo/claw version
   npm view @veewo/dsh-claw-kit version
   dsh --profile <name> --dump-config   # confirm the claw-kit row
   ```

2. **Update the global claw CLI:**
   ```powershell
   npm install -g @veewo/claw@latest
   # After restarting DSH, verify host-scoped recovery through:
   # claw_run(operation: "context", args: {})
   ```

3. **Update the DSH adapter in the profile:**
   ```powershell
   dsh plugin --profile <name> add @veewo/dsh-claw-kit@latest
   dsh --profile <name> --dump-config   # claw-kit row present
   ```

4. **Verify activation after an authorized restart:** restart `dsh --profile <name>` only with explicit restart authorization; otherwise report on-disk installation and defer activation.
   After restart, confirm `claw_run` and all skills declared by the installed package appear; run a
   `claw_run(operation: "context", args: {})` recovery smoke check when appropriate.

Treat the CLI and the adapter as one update unit — verify both before reporting
success. Do not use unpublished workspace files as the update source.
