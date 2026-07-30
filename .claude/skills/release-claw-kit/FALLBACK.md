# release-claw-kit fallback

Use this plan-independent sequence only when claw planning is unavailable or when this capability is one part of another owning workflow.

## Choose the release mode

1. Inspect `AGENTS.md`, `DISTRIBUTION.md`, the release ADR, repository/remote/tag state, npm latest versions, and every worktree change.
2. Decide the mode based on what changed:
   - **CLI release**: core or CLI files changed. Bump CLI version (3-segment), publish `@veewo/claw-core` and `@veewo/claw`.
   - **Codex plugin release**: codex-adapter changed. Bump its 4th segment only, tag and release.
   - **Other adapter release**: cindy/openclaw/opencode-adapter changed. Bump that adapter's 4th segment only, tag and release.
   - Default to the next patch only when no prepared higher target exists and the user did not specify another semver.
3. A CLI release resets all adapter versions to `<CLI_VERSION>.0`. An adapter-only release leaves other packages untouched.

## Version scheme

- CLI + Core: `MAJOR.MINOR.PATCH` (3-segment). Root `package.json`, `@veewo/claw-core`, `@veewo/claw`.
- Adapters: `CLI_VERSION.PATCH` (4-segment). Indicates which CLI version this adapter targets.
- Codex plugin manifest: equals codex-adapter package version. No timestamp suffix.
- Templates: follow CLI version.

## Prepare the release source

### CLI release

1. Update root `package.json`, `packages/core/package.json`, `packages/cli/package.json` to the new 3-segment version. Pin `@veewo/claw-core` exactly in CLI and OpenClaw adapter.
2. Reset all adapter versions to `<NewVersion>.0`:
   - `packages/codex-adapter/package.json`
   - `packages/cindy-adapter/package.json`
   - `packages/openclaw-adapter/package.json`
   - `packages/opencode-adapter/package.json`
3. Update `packages/codex-adapter/.codex-plugin/plugin.json` to match the new codex-adapter version (no timestamp).

### Codex-only plugin release

1. Bump `packages/codex-adapter/package.json` 4th segment.
2. Update `packages/codex-adapter/.codex-plugin/plugin.json` to match.

### Other adapter-only release

1. Bump that adapter's `package.json` 4th segment only.

### All modes

After version changes:
```powershell
npm install --package-lock-only --ignore-scripts
npm run sync:template-versions
npm run sync:shared-skills
npm run check:template-versions
git diff --check
git diff --stat
```

Review the full diff. `sync:template-versions` must precede `sync:shared-skills` so generated adapter copies inherit the release version.

## Verify proportionally

3. Run risk-proportionate focused checks, `git diff --check`, template/shared-skill checks, and package dry-runs when package contents are affected.

## Publish gate

4. Commit the complete release baseline on `main`, push directly to `origin/main`, and require an empty worktree plus exact `HEAD == origin/main`.
5. Run `npm run verify:release`. Tag according to the release mode:
   - CLI: `v<version>` (e.g. `v0.2.1`)
   - Codex: `vcodex-<version>` (e.g. `vcodex-0.2.1.0`)
   - Cindy: `vcindy-<version>` (e.g. `vcindy-0.2.1.0`)
   - OpenClaw: `vopenclaw-<version>`
   - OpenCode: `vopencode-<version>`
6. For CLI release only: run `npm run publish:release` to publish `@veewo/claw-core` and `@veewo/claw`. Create the GitHub Release without a plugin ZIP asset.
7. For adapter-only releases: create the GitHub Release for the relevant tag.

## Evidence

8. Verify GitHub source/tag, both npm packages' metadata and real retrieval (CLI release only), the committed Codex payload, and repository cleanliness.
9. Only after release completion, run the published-source `claw-kit:update` workflow: refresh the global CLI, upgrade the official GitHub marketplace plugin, verify the enabled identity/source/cache, then restart Codex and validate from a new task.

Stop at the failing boundary. Do not stash changes, bypass guarded scripts, move an existing tag blindly, expose credentials, or install unpublished workspace artifacts to make the update appear successful. See `references/release-protocol.md` for command groups and recovery rules.
