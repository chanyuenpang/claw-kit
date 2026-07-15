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

- `packages/codex-adapter` -> exported or locally installed Codex plugin payload

## Release Modes

Default mode is `full-publish` unless a narrower mode is explicitly requested.

- `full-publish`: verify -> publish core -> publish cli -> verify install
- `prepare-only`: verify and dry-run package artifacts only
- `publish-only`: publish already-prepared package versions

If the user does not explicitly narrow the mode, run `full-publish`.

## Repository-owner policy

This repository uses direct maintainer publishing by default:

- work from the checked-out `main` branch;
- commit the release content and push it directly to `origin/main`;
- do **not** create a feature branch or pull request unless the repository owner explicitly asks for review;
- before publishing, classify every local change: useful release content must be committed and pushed, disposable output must be removed, and intentional local-only files must be ignored;
- do not use `git stash` to make a release gate pass; a release starts and ends with a clean worktree.

`npm run verify:release` and `npm run publish:release` enforce these rules: they require the current branch to be `main`, `HEAD` to equal `origin/main`, and `git status --porcelain` to be empty. The publish command repeats the clean-worktree assertion after npm publishing.

## Versioning Rules

Keep package versions aligned unless there is a strong reason to split them.

Update these files together for a release:

1. `package.json`
2. `package-lock.json`
3. `packages/core/package.json`
4. `packages/cli/package.json`
5. `packages/codex-adapter/package.json`
6. `packages/openclaw-adapter/package.json`
7. `packages/codex-adapter/.codex-plugin/plugin.json`
8. `CHANGELOG.md`

Version rules:

- Keep `packages/core` and `packages/cli` on the same release version unless there is a deliberate split.
- Keep adapter package versions aligned with the release unless there is a deliberate reason not to.
- Use `semver+codex.<timestamp>` for `packages/codex-adapter/.codex-plugin/plugin.json`.
- Run `npm install` after editing version files so `package-lock.json` stays consistent.

Published package mapping:

- `packages/core` -> `@veewo/claw-core`
- `packages/cli` -> `@veewo/claw`
- local executable name -> `claw`

## Release Checklist

1. Confirm the target version.
2. Classify all local changes; commit useful release content, remove disposable output, and ignore intentional local-only files. Do not stash changes to bypass this step.
3. Ensure the checked-out branch is `main` and push the release commit directly to `origin/main`.
4. Align version files and changelog.
5. Run `npm install`.
6. Run verification commands.
7. Dry-run package artifacts.
8. Create the release commit and push it directly to GitHub.
9. Run `npm run verify:release`; it validates the clean tree, version alignment, exact `main`/`origin/main` parity, and exported plugin skills.
10. Confirm npm auth.
11. Publish `@veewo/claw-core` first.
12. Publish `@veewo/claw` second.
13. Verify the worktree is still clean, then verify published versions and attach the exported Codex plugin bundle to the GitHub release.
14. Refresh the locally installed CLI and local Codex plugin cache.
15. Run post-publish installation verification from a clean machine or checkout.

Execution policy by mode:

- `full-publish`: complete all 15 steps.
- `prepare-only`: complete through step 6 only.
- `publish-only`: complete steps 7-12 only.

## Verification Commands

Run these from the repository root unless noted:

```powershell
npm test
npm run check
cd packages\core
npm pack --dry-run
cd ..\cli
npm pack --dry-run
cd ..\..
git status --short
git show --no-patch --decorate --oneline HEAD
```

Recommended extra release checks:

```powershell
node -p "require('./packages/core/package.json').version"
node -p "require('./packages/cli/package.json').version"
node -p "require('./packages/codex-adapter/.codex-plugin/plugin.json').version"
rg -n "\"version\":|@veewo/claw|@veewo/claw-core" package.json package-lock.json CHANGELOG.md packages -g "!**/node_modules/**"
```

Expected outcome:

- tests and checks pass
- both `npm pack --dry-run` commands succeed
- release versions are aligned where expected
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

After publishing, refresh the maintainer machine as part of release completion:

1. Reinstall the global CLI.
2. Export and/or install the Codex plugin payload if `packages/codex-adapter` changed.
3. Verify that the local command and plugin cache actually point at the new release.

Use the closeout workflow for the local-copy details:

- [docs/2026-06-08-closeout-workflow.md](G:/Projects/claw-kit/docs/2026-06-08-closeout-workflow.md)

Codex plugin distribution commands:

```powershell
npm run export:codex-plugin
npm run install:codex-plugin
```

Expected output and install locations:

- export bundle: `dist/codex-plugin/claw-kit/<plugin-version>/`
- local Codex cache install: `C:\Users\<you>\.codex\plugins\cache\claw-kit-local\claw-kit\<plugin-version>\`

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
Get-ChildItem C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit
```

Expected outcome:

- the global npm package version matches the published `@veewo/claw` version
- `claw` resolves from `C:\Users\chany\AppData\Roaming\npm\claw.ps1`
- `claw --help` succeeds
- the exported bundle contains the expected manifest version when adapter files changed
- the local plugin cache contains the expected manifest version when adapter files changed

## Notes

- `@veewo/claw` depends on `@veewo/claw-core`, so publish order matters.
- The local executable name remains `claw`.
- `scripts/install-cli.ps1` now installs the published npm package directly.
- `packages/codex-adapter` remains the only source of truth for the Codex plugin payload; exported bundles and local cache installs are derived copies.
