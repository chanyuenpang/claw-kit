# Cindy plugin release contract

## Scope and version

- Scope: `packages/cindy-adapter` only.
- Bump only the adapter fourth segment in `package.json` and `plugin/ghost.json`;
  keep CLI/core and other adapters unchanged.
- Keep `.agents/plugins/marketplace.json` pointing `claw-kit-cindy` at
  `./packages/cindy-adapter/plugin`.
- Tag `vcindy-<version>` after the verified source reaches `origin/main`. Do not
  create a GitHub Release, upload a `.cindy` archive, or publish npm packages.

## Manifest and marketplace checks

- `skill.items` contains at most four entries and each name/description exactly
  matches its `SKILL.md` frontmatter.
- `entry` and `node.entry` are distinct safe relative paths; `node.entry` ends in
  `.js` or `.cjs`; all declared paths use forward slashes without `..`.
- Declared hooks require `launch: "resident"`; tool/slot values satisfy the Cindy
  manifest schema.
- The marketplace source directory contains the valid `ghost.json`, entrypoints,
  skills, and runtime files required by that manifest.
- Cindy discovers each marketplace entry from its source directory and packages
  it locally during install or update. Release automation must not duplicate
  that Host-owned packaging step.

## Marketplace source

- Users add the Git source `chanyuenpang/claw-kit` without a pinned ref so Cindy
  follows the repository default branch.
- The shared `.agents/plugins/marketplace.json` contains both the Codex entry and
  the Cindy entry. Cindy skips non-Ghost entries and derives plugin identity and
  version from `packages/cindy-adapter/plugin/ghost.json`.
- A custom-market release is visible only after the manifest version changes;
  never publish changed plugin bytes under an unchanged Cindy version.
- Plugin id `claw-kit` is globally unique. A legacy manually installed copy can
  be adopted only when its raw manifest matches the market candidate exactly;
  otherwise the user must uninstall the legacy copy and install once from this
  marketplace before future in-place updates are available.

## Release and installation boundaries

1. Run focused Cindy checks, template/shared-skill sync, diff checks, and package
   marketplace validation.
2. Commit intended release content on `main`, push `origin/main`, require an empty
   worktree and `HEAD == origin/main`, then run `npm run verify:release`.
3. Create and push `vcindy-<version>`.
4. Verify the tag resolves to the same clean commit as `origin/main` and that the
   tagged marketplace entry resolves to the target `ghost.json` version.
5. Only when installation refresh is requested, refresh the custom marketplace,
   accept Cindy's permission confirmation, restart Cindy, and verify the installed
   plugin is enabled and running at the target version.
