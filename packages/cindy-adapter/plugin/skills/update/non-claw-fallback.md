# Cindy update fallback

Use this path only when no `.claw` project is available.

1. Refresh the CLI with `npm install -g @veewo/claw@latest` and verify it with
   `claw --version` plus `npm list -g @veewo/claw --depth=0`.
2. In Cindy's plugin marketplace sources, add or refresh the Git source
   `chanyuenpang/claw-kit` without a pinned ref. Confirm the discovered market is
   `claw-kit` and its `claw-kit-cindy` entry resolves plugin id `claw-kit` from
   `packages/cindy-adapter/plugin`.
3. Review any permission expansion and accept Cindy's install/update
   confirmation. Cindy builds the install package from the checked-out market
   source; do not download or open a `.cindy` archive.
4. If a legacy manual `claw-kit` install conflicts, let Cindy adopt it only when
   the raw manifest is identical. Otherwise uninstall the legacy copy, then
   install once from the custom marketplace so future updates retain ownership.
5. Verify the installed plugin id `claw-kit` is enabled and running at the
   marketplace manifest version.
6. Restart Cindy, start a new task, and verify the loaded `update` skill comes
   from that version.

Do not treat a refreshed marketplace cache as installation proof and do not
silently overwrite a conflicting plugin id. Report CLI and Cindy plugin status
separately.


