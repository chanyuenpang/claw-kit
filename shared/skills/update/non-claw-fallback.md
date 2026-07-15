# update

Use this skill when startup recovery or the user explicitly wants to update claw-kit itself.

This skill is for installation refresh work, not for planning and not for editing project workflow state.

## Goal

Refresh both of these surfaces together:

- the global `@veewo/claw` CLI
- the current host plugin install surface

Do not treat one without the other as a complete claw-kit update.

## Expected behavior

1. Tell the user a newer claw-kit version was detected and that you are refreshing the local install surfaces.
2. Update the global CLI first.
3. Update the current host plugin surface second.
4. Verify both surfaces.
5. Report exact success or failure for each surface.

## Host routing

Prefer the current host when it is known:

- Codex host:
  - refresh CLI
  - refresh the local Codex plugin cache
- OpenCode host:
  - refresh CLI
  - refresh the local OpenCode plugin install surface

If the current host is unclear, inspect available repo scripts and choose the matching plugin install command conservatively.

## Preferred commands in this repo

Inside the `claw-kit` repository, prefer the maintained scripts:

```powershell
npm run install:local-cli
npm run install:codex-plugin
npm run install:opencode-plugin
```

## Verification

Always verify after updating:

- CLI:
  - `claw --version`
  - `npm list -g @veewo/claw --depth=0`
- Codex plugin:
  - confirm the newest cache directory exists under `%USERPROFILE%\.codex\plugins\cache\claw-kit-local\claw-kit\`
  - inspect that cache copy's `.codex-plugin/plugin.json`
- OpenCode plugin:
  - confirm the installed plugin files exist under the configured OpenCode plugin path

## Guardrails

- Do not claim success if only the CLI updated.
- Do not claim success if only the plugin surface updated.
- Do not silently skip verification.
- Do not invent a second install path when the maintained repo scripts exist.
- If you are not inside a `claw-kit` checkout and no supported plugin refresh path is available, say that clearly instead of pretending the plugin was updated.
