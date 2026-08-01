# Cindy plugin release contract

## Scope and version

- Scope: `packages/cindy-adapter` only.
- Bump only the adapter fourth segment in `package.json` and `plugin/ghost.json`;
  keep CLI/core and other adapters unchanged.
- Tag `vcindy-<version>` and create a GitHub Release containing the matching
  `claw-kit-<version>.cindy` installer asset. Do not publish npm packages.

## Manifest and package checks

- `skill.items` contains at most four entries and each name/description exactly
  matches its `SKILL.md` frontmatter.
- `entry` and `node.entry` are distinct safe relative paths; `node.entry` ends in
  `.js` or `.cjs`; all declared paths use forward slashes without `..`.
- Declared hooks require `launch: "resident"`; tool/slot values satisfy the Cindy
  manifest schema.
- Build a ZIP-format `.cindy` from `packages/cindy-adapter/plugin`, excluding
  dotfiles, `node_modules`, and existing `.cindy` files. Use the manifest id and
  version for the filename and verify the embedded `ghost.json` after building.

## Local build retention

Do not delete the existing rollback package before the target artifact has been
built and verified. Then inspect only non-recursive `<id>-*.cindy` files in the
plugin source directory, parse version segments numerically, and keep:

1. the target release artifact; and
2. when present, the numerically greatest version lower than the target as the
   single rollback package.

Delete every other matching local build output. Never choose the fallback by
mtime and never broaden cleanup beyond the plugin source directory.

## Release and installation boundaries

1. Run focused Cindy checks, template/shared-skill sync, diff checks, and package
   validation.
2. Commit intended release content on `main`, push `origin/main`, require an empty
   worktree and `HEAD == origin/main`, then run `npm run verify:release`.
3. Create and push `vcindy-<version>`.
4. Build and verify the `.cindy`, prune local artifacts by the retention rule,
   and attach the target package to the immutable GitHub Release.
5. Verify the release asset name, size, download URL, tag, and embedded version.
6. Only when installation refresh is requested, open the asset with Cindy, accept
   the confirmation, check `main-<date>.log` for manifest errors, restart Cindy,
   and verify the installed plugin is enabled and running at the target version.
