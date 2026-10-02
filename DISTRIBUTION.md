# claw-kit Distribution Guide

This document is the maintainer release and npm distribution handbook for this repository.

## Local beta and formal promotion

The default CLI + Codex release route is [local beta → unchanged promotion](docs/beta-release.md).
Commit source locally, freeze final-version artifacts, and test the batch for seven
days without pushing. Use `npm run publish:release -- --candidate <directory>` to
publish its exact npm tarballs before pushing source and releasing the stored
Codex artifact. Version preparation applies before freezing, never during promotion.

Current release baseline should be derived from the repository at runtime instead of trusted from static prose:

```powershell
node -p "require('./packages/core/package.json').version"
node -p "require('./packages/cli/package.json').version"
node -p "require('./packages/codex-adapter/.codex-plugin/plugin.json').version"
git show --no-patch --decorate --oneline HEAD
```

## Scope

Use this guide when you need to:

- publish `@veewo/claw-core`
- publish `@veewo/claw`
- export or install the Codex plugin payload
- verify the release artifacts before publish
- prepare release notes or a GitHub release

Current publishable packages:

- `packages/core` -> `@veewo/claw-core`
- `packages/cli` -> `@veewo/claw`

Codex plugin distribution source:

- `.agents/skills` -> canonical public skill packages alongside repository-only skills; each artifact's declaration selects its public inputs without a fixed count
- `shared/skills/knowledge-capture` -> canonical non-project-discovery manual capture package
- `packages/codex-adapter` -> adapter runtime source plus host-owned update, not a complete installable plugin
- `.agents/plugins/marketplace.json` -> marketplace packaging input with the unchanged plugin-relative path
- `npm run export:codex-marketplace -- --out-dir <isolated-output>` -> complete Git marketplace artifact tree
- an explicitly authorized published Git artifact ref containing that composed tree -> installable marketplace snapshot; never tag raw incomplete adapter source as if it were an artifact

GitHub Release ZIP assets are not part of the supported Codex installation path. `npm run export:codex-plugin` remains a maintainer-only inspection and local-development tool.

## Release Modes

There are six independent artifact families. Select the requested artifact before choosing a version:

| Artifact family | Source scope | Version | Published artifact | Tag |
|---|---|---|---|---|
| CLI | core, CLI, or shared CLI/runtime | 3 segments | `@veewo/claw-core` then `@veewo/claw` | `v<version>` |
| Codex plugin | codex-adapter | 4 segments | committed GitHub marketplace snapshot | `vcodex-<version>` |
| Cindy plugin | main repository `packages/cindy-adapter` | 4 segments | composed tree delivered to existing independent artifact-only marketplace repository | `vcindy-<version>` in the artifact repository |
| DSH adapter | dsh-adapter | 4 segments in git; npm prerelease `<cli-base>-rc.<n>` | `@veewo/dsh-claw-kit` on the npm registry | `vdsh-<version>` |
| OpenClaw plugin | openclaw-adapter | 4 segments | OpenClaw adapter GitHub release artifact | `vopenclaw-<version>` |
| OpenCode plugin | opencode-adapter | 4 segments | OpenCode adapter GitHub release artifact | `vopencode-<version>` |

Platform requests remain platform-only. CLI/core requests include core and CLI. Mixed adapter scopes require an explicit batch decision. Packaging, export, and dry-run requests are `prepare-only` unless publishing is explicitly requested.

### CLI release

Triggered when core or CLI files changed. Publishes `@veewo/claw-core` then `@veewo/claw` to npm, creates a GitHub Release with tag `v<version>`. Resets all adapter fourth segments to `.0` only in an explicitly coordinated batch.

### Codex plugin release

Triggered when codex-adapter changed. Updates the committed marketplace snapshot, tags `vcodex-<version>`, and creates a GitHub Release. No npm publish.

### Platform adapter releases

- Cindy source lives in this main repository; only the isolated assembled artifact is delivered to the existing `claw-kit-cindy-adapter` marketplace repository.
- DSH publishes `@veewo/dsh-claw-kit` to npm and tags `vdsh-<version>` in this repository.
- OpenClaw and OpenCode create their artifact-specific GitHub releases and tags.

### Narrower modes

- prepare-only: verify and dry-run package artifacts only
- publish-only: publish already-prepared package versions

If the user does not explicitly identify an artifact and the diff spans multiple scopes, stop and request the artifact choice; do not silently promote the change to a CLI release.

## Template-driven maintainer release

The repository-local `release-claw-kit` skill routes to artifact-specific release
skills; it has no template of its own. `beta-claw-kit` owns local beta preparation.
Follow the selected skill's host workflow. Release and local update remain separate
completion boundaries.

## Repository-owner policy

This repository uses direct maintainer publishing by default:

- work from the checked-out `main` branch;
- commit beta source locally; during formal promotion publish npm first, then push directly to `origin/main`;
- do **not** create a feature branch or pull request unless the repository owner explicitly asks for review;
- before freezing beta, classify every local change: commit useful content locally, remove disposable output and ignore local-only files;
- do not use `git stash` to make a release gate pass; a release starts and ends with a clean worktree.

With `--candidate`, `verify:release` and `publish:release` use clean local main at
the candidate revision; remote equality is required after publication, not before
npm upload. `publish:batch-release` also requires a candidate and leaves platform
tag/Release creation to the corresponding skills. Without a candidate,
`verify:release` retains its historical clean origin/main diagnostic gate, and
`verify:batch-release` adds coordinated platform checks. Neither diagnostic path
replaces beta promotion.

## Versioning Rules

### Version scheme

| Component | Format | Example | Notes |
|-----------|--------|---------|-------|
| CLI + Core | `MAJOR.MINOR.PATCH` | `0.2.1` | Root `package.json`, `@veewo/claw-core`, `@veewo/claw` share this. |
| Codex adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | 4th segment for independent iteration. |
| Cindy adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule. |
| DSH adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule in git; published to npm as prerelease `<CLI_VERSION>-rc.PATCH` (`0.2.1.0` → `0.2.1-rc.0`) because npm has no four-segment release version. |
| OpenClaw adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule. |
| OpenCode adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule. |
| Codex plugin manifest | `ADAPTER_VERSION` | `0.2.1.0` | Mirrors codex-adapter package version. No timestamp. |
| Templates | independent template driver | `1.0.0` | TEMPLATE.json `version` is independent of package/release versions. |

### Version file checklist

#### CLI release (always includes core)

Update these to the new `MAJOR.MINOR.PATCH` version:

1. Root `package.json` (version)
2. `package-lock.json`
3. `packages/core/package.json` (version)
4. `packages/cli/package.json` (version; dependency `@veewo/claw-core` pinned exactly)
5. `packages/core/src/templates/plans/default.ts` when its release-tracked version changes
6. `CHANGELOG.md`

Do not bump, validate, or publish platform adapter artifacts as part of a CLI-only release. A coordinated batch release makes that choice explicitly and then applies the corresponding adapter version and marketplace checks.

#### Codex-only plugin release

Update only:

1. `packages/codex-adapter/package.json` (bump 4th segment)
2. `packages/codex-adapter/.codex-plugin/plugin.json` (match adapter version)

Do not touch CLI/core or other adapters.

#### Other adapter-only release

Update only:

1. `packages/<adapter>/package.json` (bump 4th segment)

### Post-edit steps

After changing version files:

- Run `npm install --package-lock-only --ignore-scripts` to keep `package-lock.json` consistent.
- Run `npm run sync:template-versions` only when changing the independent template driver. This updates every project/plugin template plus the built-in default template.
- Run `npm run check:skill-sources` after template-driver synchronization, then require `npm run check:template-versions` to pass.
- Do not bump only one adapter copy of shared skills.

### Publishing rules

- `packages/core` -> `@veewo/claw-core`
- `packages/cli` -> `@veewo/claw`
- CLI pins `@veewo/claw-core` exactly (no range).
- Core is always published before CLI.
- Adapter packages are not published to npm except the DSH adapter
  (`@veewo/dsh-claw-kit`); the other adapters release through their own
  marketplace / GitHub artifacts (Codex, OpenCode, OpenClaw) or a separate
  repository (Cindy).

## Release Checklist

Use [the beta workflow](docs/beta-release.md) for the complete maintained commands.

1. Prepare the intended stable version, classify changes, run proportionate checks,
   and commit locally on main. Do not push during beta.
2. Run `npm run beta:pack`; install that batch and confirm CLI/plugin versions.
3. Record the start with `npm run beta:start-test -- --candidate <directory>` and
   test it locally for seven days. Use smoke-test-claw-kit with that beta batch.
4. For formal release run `npm run verify:release -- --candidate <directory>`,
   then `npm run publish:release -- --candidate <directory>`. This publishes
   frozen Core/Client/CLI tarballs, verifies retrieval, and only then pushes main.
5. Finish immutable source and adapter tags/Releases using the artifact-specific
   skills. Codex reuses the saved composed marketplace tree without rebuilding.
6. Confirm local main equals origin/main and the worktree is clean. Refresh local
   installations separately when requested.

Other adapter-only releases keep their own artifact-specific contracts. Never
push an adapter requiring a CLI that cannot yet be retrieved from npm. Do not use
raw workspace npm publish to bypass the beta path.

For ordinary development, `npm test` selects affected test domains. Use
`npm run test:list` to inspect them and run focused checks proportionate to the
change. `npm run test:release-candidate` checks beta packing and promotion.

## Remote Install Paths

Windows one-shot install:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-cli.ps1
```

Direct npm install:

```powershell
npm install -g @veewo/claw
```

Official Codex plugin install on a remote machine:

```powershell
codex plugin marketplace add chanyuenpang/claw-kit --ref vcodex-0.2.42.0
codex plugin marketplace list
codex plugin add claw-kit@claw-kit
```

Use the complete composed Git marketplace artifact. Its catalog retains `source.path` to `packages/codex-adapter`, where the assembled skills are already present; selecting only the catalog is incomplete. A raw source checkout also requires assembly and is not itself a ready plugin. See docs/public-skill-sources.md; do not repopulate source directories to satisfy installation.

Restart the ChatGPT desktop app, choose the **Claw Kit** marketplace in the plugin directory, install **Claw Kit**, and start a new task. Codex loads the installed copy from:

```text
%USERPROFILE%\.codex\plugins\cache\claw-kit\claw-kit\<plugin-version>\
```

Refresh the Git snapshot with `codex plugin marketplace upgrade claw-kit`, then reinstall or enable `claw-kit@claw-kit` before testing a newer plugin version. Verify that no older same-name identity such as `claw-kit@claw-kit-local` remains enabled against a stale source. Do not depend on post-install generation: Codex copies the marketplace source into its cache, and npm-backed plugin installation does not run lifecycle scripts.

After publishing and verifying registry/GitHub state, invoke the update skill to refresh the maintainer machine:

1. Reinstall the global CLI.
2. Install the Codex plugin from the published GitHub marketplace snapshot.
3. Verify that `claw-kit@claw-kit` is enabled, `claw-kit@claw-kit-local` is disabled, and the official cache points at the new release.

Maintainer Codex plugin commands:

```powershell
npm run export:codex-plugin
npm run install:codex-plugin
```

Expected output and install locations:

- export bundle: `dist/codex-plugin/claw-kit/<plugin-version>/`
- published complete marketplace artifact: `https://github.com/chanyuenpang/claw-kit.git` at immutable `vcodex-<plugin-version>` (for example, `vcodex-0.2.42.0`)
- official Codex cache install: `C:\Users\<you>\.codex\plugins\cache\claw-kit\claw-kit\<plugin-version>\`

The maintained installer resolves `vcodex-<plugin-version>` from the reviewed plugin manifest, fetches that immutable artifact commit, and installs its already-composed `packages/codex-adapter` payload into only the official cache. It enables `claw-kit@claw-kit` and disables `claw-kit@claw-kit-local`. It must run after artifact publication, never rebuild from incomplete source main.

## Post-publish Install Verification

Run these checks on Windows after reinstalling the CLI:

```powershell
npm install -g @veewo/claw
npm list -g @veewo/claw --depth=0
(Get-Command claw).Source
claw --help
```

If the release changed the Codex adapter, also verify the plugin cache copy:

```powershell
npm run export:codex-plugin
npm run install:codex-plugin
Get-Content packages/codex-adapter/.codex-plugin/plugin.json
Get-ChildItem dist/codex-plugin/claw-kit
Get-ChildItem C:\Users\chany\.codex\plugins\cache\claw-kit\claw-kit
node packages\cli\dist\bin.js template validate --template update
node packages\cli\dist\bin.js template validate --template create-claw-skill
```

Expected outcome:

- the global npm package version matches the published `@veewo/claw` version
- `claw` resolves from `C:\Users\chany\AppData\Roaming\npm\claw.ps1`
- `claw --help` succeeds
- the exported bundle contains the expected manifest version when adapter files changed
- the official Git marketplace revision contains the expected plugin version
- the official plugin cache contains the expected manifest version when adapter files changed
- `claw-kit@claw-kit` is enabled and `claw-kit@claw-kit-local` is disabled
- the repository marketplace source contains `planning`, `config`, `update`, and `create-claw-skill`, including templates and helper resources
- both bundled templates pass the real CLI validation command from an isolated cache

## Notes

- `@veewo/claw` depends on `@veewo/claw-core`, so publish order matters.
- The local executable name remains `claw`.
- `scripts/install-cli.ps1` now installs the published npm package directly.
- Public skills have one canonical source and are copied only into isolated build artifacts. Publish the composed complete Git marketplace tree, not raw adapter source; source revision, artifact revision and active installation remain separate evidence. Runtime plugin layout is unchanged.
- GitHub Release notes and tags remain useful release records, but the Codex installation flow consumes the Git marketplace snapshot and does not require a ZIP attachment.
