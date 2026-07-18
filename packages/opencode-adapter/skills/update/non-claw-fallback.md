# OpenCode update fallback

Use this path only when no `.claw` project is available.

1. Confirm the target claw-kit version is published and obtain the maintained source checkout at that version.
2. From that checkout run `npm run install:opencode-plugin`. This rebuilds and reinstalls the CLI before deploying the OpenCode plugin surfaces.
3. Verify `claw --version` and `npm list -g @veewo/claw --depth=0`.
4. Verify the plugin payload, root shim, discovered skills, agent definitions, references, and workflow guidance under `~/.config/opencode`.
5. Confirm retired `truth-writer` and `adr-writer` discovery directories are absent.
6. Restart OpenCode and verify the loaded plugin version.

If the maintained source checkout or installer is unavailable, report the OpenCode plugin refresh as blocked instead of silently performing a CLI-only update. Do not edit installed copies directly.
