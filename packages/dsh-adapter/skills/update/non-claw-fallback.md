# Update claw-kit on DSH — fallback route (no claw planning)

If claw planning is unavailable, update the DSH install directly:

1. **Detect versions:**
   ```powershell
   claw --version
   npm view @veewo/claw version
   npm view @veewo/dsh-claw-kit version
   dsh --profile web --dump-config   # confirm the claw-kit row
   ```

2. **Update the global claw CLI:**
   ```powershell
   npm install -g @veewo/claw@latest
   # After restarting DSH, verify host-scoped recovery through:
   # claw_run(operation: "context", args: {})
   ```

3. **Update the DSH adapter in the profile:**
   ```powershell
   dsh plugin --profile web add @veewo/dsh-claw-kit@latest
   dsh --profile web --dump-config   # claw-kit row present
   ```

4. **Restart the Host and verify activation:** restart `dsh --profile web`,
   then confirm the `claw_run` tool and the seven bundled skills appear; run a
   `claw_run(operation: "context", args: {})` recovery smoke check when appropriate.

Treat the CLI and the adapter as one update unit — verify both before reporting
success. Do not use unpublished workspace files as the update source.
