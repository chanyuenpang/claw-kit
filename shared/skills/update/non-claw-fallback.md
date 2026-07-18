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
  - add or upgrade the published `chanyuenpang/claw-kit` marketplace and install the official plugin identity
- OpenCode host:
  - refresh CLI
  - refresh the local OpenCode plugin install surface

If the current host is unclear, inspect available repo scripts and choose the matching plugin install command conservatively.

## Preferred commands in this repo

Inside the `claw-kit` repository, use the maintained scripts only after the target version has been published and verified:

```powershell
npm run install:local-cli
npm run install:codex-plugin
npm run install:opencode-plugin
```

The Codex installer clones the published GitHub marketplace and activates `claw-kit@claw-kit`; it never installs a local marketplace identity. On any Codex machine, the equivalent official lifecycle is:

```powershell
codex plugin marketplace add chanyuenpang/claw-kit --ref main
codex plugin marketplace upgrade claw-kit
codex plugin marketplace list
codex plugin add claw-kit@claw-kit
```

After adding or upgrading the marketplace, reinstall or enable `claw-kit@claw-kit` with the command above or through the plugin directory. Disable or uninstall `claw-kit@claw-kit-local`. Restart the ChatGPT desktop app and start a new task. Do not update the plugin from unpublished workspace files.

## Verification

Always verify after updating:

- CLI:
  - `claw --version`
  - `npm list -g @veewo/claw --depth=0`
- Codex plugin:
  - verify `claw-kit@claw-kit` is enabled and inspect its cache manifest under `%USERPROFILE%\.codex\plugins\cache\claw-kit\claw-kit\`
  - verify `claw-kit@claw-kit-local` is disabled
  - require the active identity's source manifest and cache manifest to match the target version
  - detect another enabled same-name identity that still points at an older source; a newer unused cache directory is not success
  - confirm `skills/planning`, `skills/config`, `skills/update`, `skills/create-claw-skill`, and `skills/knowledge-writer` exist, and retired `skills/truth-writer` and `skills/adr-writer` are absent, in the active source/cache copy
  - restart Codex, start a new task, and confirm the loaded skill locator belongs to the expected version
- OpenCode plugin:
  - confirm the installed plugin files exist under the configured OpenCode plugin path

## Guardrails

- Do not claim success if only the CLI updated.
- Do not claim success if only the plugin surface updated.
- Do not silently skip verification.
- Do not use cache-directory existence as the only Codex plugin verification.
- Do not leave an older same-name Codex plugin identity enabled and assume the newest cache wins.
- Do not refresh Codex from a local marketplace or unpublished checkout.
- Do not invent a second install path when the maintained repo scripts exist.
- If the Codex marketplace CLI or desktop plugin directory is unavailable, say that clearly instead of pretending the plugin was updated.
