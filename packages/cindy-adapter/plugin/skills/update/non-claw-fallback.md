# Cindy update fallback

Use this path only when no `.claw` project is available.

1. Enumerate `chanyuenpang/claw-kit` GitHub Releases. Ignore drafts and
   prereleases unless explicitly requested, filter tags beginning with
   `vcindy-`, compare adapter versions numerically, and select the newest release
   containing a `.cindy` asset whose filename version matches the tag. Do not use
   the repository-wide `releases/latest` shortcut.
2. Refresh the CLI with `npm install -g @veewo/claw@latest` and verify it with `claw --version` plus `npm list -g @veewo/claw --depth=0`.
3. Download the matching asset from its immutable GitHub Release URL. Verify
   the embedded `ghost.json` version matches the `vcindy-` tag, then open the
   `.cindy` file with Cindy and accept the install/update confirmation.
4. Verify the installed plugin id `claw-kit` is enabled and running at the same version.
5. Restart Cindy, start a new task, and verify the loaded `update` skill comes from that version.

Do not use GitHub `main`, a marketplace snapshot, an unpublished checkout, or
cache-directory existence as proof of success. If the newest stable `vcindy-*`
release has no matching `.cindy` asset, stop and report that publishing defect.
Report CLI and Cindy plugin status separately.


