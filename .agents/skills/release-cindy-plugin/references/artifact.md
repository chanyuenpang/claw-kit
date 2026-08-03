# Cindy plugin release contract

## Scope and version

- Scope: `packages/cindy-adapter` only.
- Bump only the adapter fourth segment in `package.json` and `plugin/ghost.json`;
  keep CLI/core and other adapters unchanged.
- Keep `.claude-plugin/marketplace.json` pointing `claw-kit-cindy` at
  `./packages/cindy-adapter/plugin`.
- Tag `vcindy-<version>` after the verified source reaches `origin/main`. Do not
  create a GitHub Release, upload a `.cindy` archive, or publish npm packages.

## Manifest and marketplace checks

- `skill.items` contains at most four entries and each name/description exactly
  matches its `SKILL.md` frontmatter.
- The marketplace source directory contains the valid `ghost.json`, entrypoints,
  skills, and runtime files required by that manifest.
- Cindy uses sparse checkout to load `.claude-plugin/marketplace.json`; its
  `claw-kit-cindy` entry is the only Ghost candidate in that checkout.

## Marketplace source

- Users add the Git source `chanyuenpang/claw-kit` without a pinned ref.
- The Codex `.agents/plugins/marketplace.json` contains only the Codex entry.
- In Cindy, configure sparse paths `.claude-plugin` and
  `packages/cindy-adapter/plugin`; Cindy derives identity and version from the
  plugin `ghost.json`.
- A custom-market release is visible only after the manifest version changes.

## Release and installation boundaries

1. Run focused Cindy checks and validate the sparse marketplace payload.
2. Commit intended release content on `main`, push `origin/main`, require an empty
   worktree and `HEAD == origin/main`, then run `npm run verify:release`.
3. Create and push `vcindy-<version>`.
4. Only when installation refresh is requested, refresh the custom marketplace,
   accept Cindy's permission confirmation, restart, and verify the installed
   plugin is enabled and running at the target version.
