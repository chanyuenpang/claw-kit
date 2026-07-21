# release-claw-kit fallback

Use this plan-independent sequence only when claw planning is unavailable or when this capability is one part of another owning workflow:

1. Inspect `AGENTS.md`, `DISTRIBUTION.md`, the release ADR, repository/remote/tag state, npm latest versions, and every worktree change. Default to the next patch only when no prepared higher target exists and the user did not specify another semver.
2. Align all package and adapter versions, core dependency pins, the `semver+codex.<timestamp>` plugin manifest, changelog, and lockfile. Run `npm run sync:template-versions`, then `npm run sync:shared-skills`, and review the generated diff.
3. Run risk-proportionate focused checks, `git diff --check`, template/shared-skill checks, and package dry-runs when package contents are affected.
4. Commit the complete release baseline on `main`, push directly to `origin/main`, and require an empty worktree plus exact `HEAD == origin/main`.
5. Run `npm run verify:release`; after it passes, create/push the immutable release tag, run `npm run publish:release`, and create the GitHub Release without a plugin ZIP asset.
6. Verify GitHub source/tag, both npm packages' metadata and real retrieval, the committed Codex payload, and repository cleanliness.
7. Only after release completion, run the published-source `claw-kit:update` workflow: refresh the global CLI, upgrade the official GitHub marketplace plugin, verify the enabled identity/source/cache, then restart Codex and validate from a new task.

Stop at the failing boundary. Do not stash changes, bypass guarded scripts, move an existing tag blindly, expose credentials, or install unpublished workspace artifacts to make the update appear successful. See `references/release-protocol.md` for command groups and recovery rules.
