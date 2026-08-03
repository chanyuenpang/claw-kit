# claw-kit Distribution Guide

This document is the maintainer release and npm distribution handbook for this repository.

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

- `shared/skills` -> editable cross-host shared skill content
- `packages/codex-adapter` -> fully materialized, committed Codex plugin payload
- `.agents/plugins/marketplace.json` -> official Codex repository marketplace entry
- the committed Git ref containing those paths -> official Codex plugin release artifact

GitHub Release ZIP assets are not part of the supported Codex installation path. `npm run export:codex-plugin` remains a maintainer-only inspection and local-development tool.

## Release Modes

There are five independent artifact families. Select the requested artifact before choosing a version:

| Artifact family | Source scope | Version | Published artifact | Tag |
|---|---|---|---|---|
| CLI | core, CLI, or shared CLI/runtime | 3 segments | `@veewo/claw-core` then `@veewo/claw` | `v<version>` |
| Codex plugin | codex-adapter | 4 segments | committed GitHub marketplace snapshot | `vcodex-<version>` |
| Cindy plugin | cindy-adapter | 4 segments | Cindy adapter GitHub release artifact | `vcindy-<version>` |
| OpenClaw plugin | openclaw-adapter | 4 segments | OpenClaw adapter GitHub release artifact | `vopenclaw-<version>` |
| OpenCode plugin | opencode-adapter | 4 segments | OpenCode adapter GitHub release artifact | `vopencode-<version>` |

Platform requests remain platform-only. CLI/core requests include core and CLI. Mixed adapter scopes require an explicit batch decision. Packaging, export, and dry-run requests are `prepare-only` unless publishing is explicitly requested.

### CLI release

Triggered when core or CLI files changed. Publishes @veewo/claw-core then @veewo/claw to npm, creates a GitHub Release with tag <version>. Resets all adapter 4th segments to .0.

### Codex plugin release

Triggered when codex-adapter changed. Updates the committed marketplace snapshot, tags codex-<version>, creates a GitHub Release. No npm publish (adapter is private).

### Cindy, OpenClaw, or OpenCode adapter release

Triggered when exactly one platform adapter changed. Tag the relevant adapter release, create a GitHub Release, and do not publish npm packages.

### Narrower modes

- prepare-only: verify and dry-run package artifacts only
- publish-only: publish already-prepared package versions

If the user does not explicitly identify an artifact and the diff spans multiple scopes, stop and request the artifact choice; do not silently promote the change to a CLI release.

## Template-driven maintainer release

The supported maintainer orchestration entrypoint is the repository-local `.agents/skills/release-claw-kit` template. It is project governance for this repository and is not part of the published Codex plugin:

```powershell
claw plan create --template release-claw-kit --title release-claw-kit
```

Follow its returned `workflowGuidance` through preparation, direct-main delivery, guarded publish, release evidence, and the subsequent published-source Codex update. The template sequences the release and update workflows for convenience, but preserves their separate completion boundaries: GitHub/npm/plugin artifact evidence completes the release before local CLI and Codex installation evidence begins.

## Repository-owner policy

This repository uses direct maintainer publishing by default:

- work from the checked-out `main` branch;
- commit the release content and push it directly to `origin/main`;
- do **not** create a feature branch or pull request unless the repository owner explicitly asks for review;
- before publishing, classify every local change: useful release content must be committed and pushed, disposable output must be removed, and intentional local-only files must be ignored;
- do not use `git stash` to make a release gate pass; a release starts and ends with a clean worktree.

`npm run verify:release` and `npm run publish:release` enforce these rules: they require the current branch to be `main`, `HEAD` to equal `origin/main`, and `git status --porcelain` to be empty. The publish command repeats the clean-worktree assertion after npm publishing.

## Versioning Rules

### Version scheme

| Component | Format | Example | Notes |
|-----------|--------|---------|-------|
| CLI + Core | `MAJOR.MINOR.PATCH` | `0.2.1` | Root `package.json`, `@veewo/claw-core`, `@veewo/claw` share this. |
| Codex adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | 4th segment for independent iteration. |
| Cindy adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule. |
| OpenClaw adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule. |
| OpenCode adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule. |
| Codex plugin manifest | `ADAPTER_VERSION` | `0.2.1.0` | Mirrors codex-adapter package version. No timestamp. |
| Templates | `CLI_VERSION` | `0.2.1` | TEMPLATE.json `version` follows CLI version. |

### Version file checklist

#### CLI release (always includes core)

Update these to the new `MAJOR.MINOR.PATCH` version:

1. Root `package.json` (version)
2. `package-lock.json`
3. `packages/core/package.json` (version)
4. `packages/cli/package.json` (version; dependency `@veewo/claw-core` pinned exactly)
5. Reset all adapter versions to `<CLI_VERSION>.0`:
   - `packages/codex-adapter/package.json`
   - `packages/cindy-adapter/package.json`
   - `packages/openclaw-adapter/package.json`
   - `packages/opencode-adapter/package.json`
6. `packages/codex-adapter/.codex-plugin/plugin.json` = `<CLI_VERSION>.0`
7. `packages/openclaw-adapter/package.json` dependency `@veewo/claw-core` pinned exactly
8. `packages/core/src/templates/plans/default.ts`
9. Every release-tracked `TEMPLATE.json` under `.agents/skills`, `shared/skills`, `packages/codex-adapter/skills`, and `packages/opencode-adapter/skills`
10. `CHANGELOG.md`

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
- Run `npm run sync:template-versions`. This updates every project/plugin template plus the built-in default template.
- Run `npm run sync:shared-skills` after template synchronization, then require `npm run check:template-versions` to pass.
- Do not bump only one adapter copy of shared skills.

### Publishing rules

- `packages/core` -> `@veewo/claw-core`
- `packages/cli` -> `@veewo/claw`
- CLI pins `@veewo/claw-core` exactly (no range).
- Core is always published before CLI.
- Adapter packages are private and not published to npm.

## Release Checklist

### For any release mode

1. Confirm the target artifact family: CLI, Codex, Cindy, OpenClaw, or OpenCode; or record `prepare-only`.
2. Classify all local changes; commit useful release content, remove disposable output, and ignore intentional local-only files. Do not stash changes to bypass this step.
3. Ensure the checked-out branch is `main` and push the release commit directly to `origin/main`.
4. Align package versions according to the version scheme, then run `npm run sync:template-versions`.
5. Run `npm run sync:shared-skills`, followed by `npm run check:template-versions`; review the generated adapter files and include them in the release commit.
6. Run `npm install`.
7. Run verification commands.
8. Dry-run package artifacts.
9. Create the release commit and push it directly to GitHub.
10. Run `npm run verify:release`; it validates the clean tree, version alignment, exact `main`/`origin/main` parity, marketplace metadata, materialized Codex skills, exported payload, and isolated `claw template validate` execution from a marketplace-style cache.

### CLI release only

11. Confirm npm auth.
12. Publish `@veewo/claw-core` first (`npm run publish:release` handles this).
13. Publish `@veewo/claw` second.
14. Verify the worktree is still clean, verify published versions, and create the GitHub release with tag `v<version>` without a plugin ZIP asset.
    The committed marketplace snapshot is the plugin artifact; create the GitHub release without a plugin ZIP asset.
15. Refresh the locally installed CLI and maintainer development cache.
16. Upgrade the Codex marketplace snapshot and verify installation from a clean machine.

### Codex plugin release only

11. Create and push the tag `vcodex-<version>`. Create the GitHub Release for the committed marketplace snapshot.
12. Upgrade the Codex marketplace snapshot and verify installation from a clean machine.

### Platform adapter release only

11. Create and push the tag e.g. `vcindy-<version>`. Create the GitHub Release.
12. Verify the tag and the committed adapter source.


- `full-publish`: complete all 16 steps.
- `prepare-only`: complete through step 6 only.
- `publish-only`: complete steps 7-12 only.

## Verification Commands

Run these from the repository root unless noted:

```powershell
npm run test:full
npm run check
npm run check:template-versions
npm run test:codex-plugin
node --test scripts/sync-shared-skills.test.mjs
cd packages\core
npm pack --dry-run
cd ..\cli
npm pack --dry-run
cd ..\..
git status --short
git show --no-patch --decorate --oneline HEAD
```

For ordinary development, `npm test` selects test domains from staged,
unstaged, and untracked paths. Use `npm run test:domain -- <domain>` to select a
known area explicitly, `npm run test:list` to inspect available domains, or
`npm run test:changed -- --base <ref>` to include committed changes since a
branch or tag. Unclassified and cross-cutting files conservatively select the
full suite; documentation-only changes select no executable tests. Release and
broad integration validation must use `npm run test:full` explicitly.

The CLI suite is split by product responsibility into `cli-workflow`,
`cli-session-scope`, `cli-search`, `cli-closeout`, `cli-host-actions`,
`cli-project`, and `cli-surface`. Dedicated CLI source and test files select
their exact domain. The shared `cli.ts` entrypoint explicitly selects all CLI
domains because it still owns all parsing routes; it does not use a hidden
monolithic compatibility suite. Shared test support also selects all CLI
domains, while unknown paths continue to escalate to `full`.

Recommended extra release checks:

```powershell
node -p "require('./packages/core/package.json').version"
node -p "require('./packages/cli/package.json').version"
node -p "require('./packages/codex-adapter/.codex-plugin/plugin.json').version"
npm run check:template-versions
rg -n "\"version\":|@veewo/claw|@veewo/claw-core" package.json package-lock.json CHANGELOG.md packages -g "!**/node_modules/**"
```

Expected outcome:

- tests and checks pass
- both `npm pack --dry-run` commands succeed
- release versions are aligned where expected
- every plugin template and the built-in default template match the CLI release version
- no unexpected dirty changes remain before publish

## Auth and Permission Checks

Before publishing, this machine must be logged in to npm:

```powershell
npm login
npm whoami
```

If publish is scoped through the `@veewo` organization, the current account must have permission to publish under that scope.

Common blockers:

- `ENEEDAUTH`: not logged in
- `403 Forbidden`: missing scope permission or package ownership
- version already exists: bump the version before retrying

## Publish Sequence

Publish order matters because `@veewo/claw` depends on `@veewo/claw-core`.

```powershell
cd packages\core
npm publish --access public
cd ..\cli
npm publish --access public
cd ..\..
```

Verify the registry after publish:

```powershell
npm view @veewo/claw-core version --registry=https://registry.npmjs.org
npm view @veewo/claw version --registry=https://registry.npmjs.org
```

The supported guarded entrypoint is:

```powershell
npm run verify:release
npm run publish:release
```

Both commands intentionally fail if the release worktree is dirty, the current branch is not `main`, or the local and remote `main` commits differ. Do not use direct `npm publish` as a substitute: it can create a registry release with no corresponding GitHub source commit.

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
codex plugin marketplace add chanyuenpang/claw-kit --ref main
codex plugin marketplace list
codex plugin add claw-kit@claw-kit
```

Use the full repository marketplace checkout. A sparse checkout that contains only `.agents/plugins` is incomplete because the marketplace entry resolves `source.path` to `packages/codex-adapter`.

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
- published marketplace: `https://github.com/chanyuenpang/claw-kit.git` at `main`
- official Codex cache install: `C:\Users\<you>\.codex\plugins\cache\claw-kit\claw-kit\<plugin-version>\`

The maintained installer clones the published repository, writes only the official cache, enables `claw-kit@claw-kit`, and disables `claw-kit@claw-kit-local`. It must run after publication, never before it.

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
- `shared/skills` is the editable source for cross-host skills. The committed and published `packages/codex-adapter` tree is the canonical installable Codex plugin source; local unpublished payloads are not installable.
- GitHub Release notes and tags remain useful release records, but the Codex installation flow consumes the Git marketplace snapshot and does not require a ZIP attachment.
