# claw-kit release protocol

Run commands from the repository root. Treat current repository files as authority when commands or script names drift.

## Baseline and preparation

Inspect before editing:

```powershell
git status --short --branch
git remote -v
git fetch origin --tags
git rev-parse HEAD
git rev-parse origin/main
npm view @veewo/claw-core version --registry=https://registry.npmjs.org
npm view @veewo/claw version --registry=https://registry.npmjs.org
```

After aligning the release version, dependency pins, plugin timestamp version, changelog, and lockfile:

```powershell
npm install --package-lock-only --ignore-scripts
npm run sync:template-versions
npm run sync:shared-skills
npm run check:template-versions
git diff --check
git diff --stat
```

Review the full diff. `sync:template-versions` must precede `sync:shared-skills` so generated adapter copies inherit the release version.

## Proportional candidate verification

Always choose checks from the actual diff and root `AGENTS.md`. Common focused checks are:

```powershell
node --test scripts/sync-shared-skills.test.mjs
npm run test:codex-plugin
npm run test:opencode-plugin
npm run check
```

Use `npm test` for sufficiently risky runtime changes. Use `npm pack --dry-run --workspace @veewo/claw-core` and `npm pack --dry-run --workspace @veewo/claw` when package contents, dependency metadata, or executable mapping changed.

## Exact-source publish gate

Commit intended release content on `main`, push it to `origin/main`, then prove the source gate:

```powershell
git status --porcelain
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
npm run verify:release
```

Only an empty first command, branch `main`, equal commit hashes, and a successful guarded verifier permit publishing. Create and push `v<version>` for that exact commit, then use:

```powershell
npm whoami
npm run publish:release
```

Do not place npm tokens in committed or reported output. Remove any temporary auth material after publishing.

Create the GitHub Release from the immutable tag with concise notes derived from the release changelog. Do not attach a plugin ZIP; the committed marketplace snapshot at the Git ref is the Codex artifact.

## Release evidence

Verify GitHub and registry state rather than trusting command exit alone:

```powershell
git ls-remote origin refs/heads/main refs/tags/v<version>
npm view @veewo/claw-core@<version> version dist-tags.latest dist.tarball dist.integrity dist.shasum --json --registry=https://registry.npmjs.org
npm view @veewo/claw@<version> version dist-tags.latest bin dependencies dist.tarball dist.integrity dist.shasum --json --registry=https://registry.npmjs.org
npm pack @veewo/claw@<version> --dry-run --registry=https://registry.npmjs.org
git status --porcelain
```

Also inspect the committed `packages/codex-adapter/.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and expected skill files at the release commit. The Git ref containing the committed marketplace paths is the plugin artifact; a GitHub Release ZIP is not required.

If registry metadata is visible but retrieval returns stale `ETARGET`, wait for propagation, then run `npm cache clean --force` once before retrying. Do not roll back a successful publish or reuse a version.

## Published-source maintainer update

Release completion does not imply the current machine is updated. After registry and GitHub evidence pass, apply the installed `claw-kit:update` workflow. It must refresh the global CLI from npm, upgrade the `chanyuenpang/claw-kit` GitHub marketplace source, enable only `claw-kit@claw-kit`, verify matching source/cache manifests and payload, then restart Codex and validate from a new task. Never substitute a workspace-local install in this phase.

## Stop and recovery rules

- Dirty or divergent source: classify and resolve it before commit; never stash to satisfy a gate.
- Verification failure: fix the candidate, rerun affected checks, commit, push, and rerun the guarded verifier.
- Existing package version: inspect both package registries and the source commit; choose a new version rather than republishing.
- Existing tag: verify its target; never force-move it without explicit authority.
- Core published but CLI failed: preserve evidence, fix only the CLI blocker, and retry the CLI at the same release version if it is not already published.
- Registry delay: keep the release pending until metadata and retrieval agree.
- Update failure after release: report the release as complete and the separate installation refresh as failed/pending; never rewrite release evidence.
