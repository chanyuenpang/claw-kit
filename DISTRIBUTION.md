# claw-kit Distribution Guide

This document is the maintainer release and npm distribution handbook for this repository.

## Scope

Use this guide when you need to:

- publish `@veewo/claw-core`
- publish `@veewo/claw`
- verify the release artifacts before publish
- prepare release notes or a GitHub release

Current publishable packages:

- `packages/core` -> `@veewo/claw-core`
- `packages/cli` -> `@veewo/claw`

## Release Modes

Default mode is `full-publish` unless a narrower mode is explicitly requested.

- `full-publish`: verify -> publish core -> publish cli -> verify install
- `prepare-only`: verify and dry-run package artifacts only
- `publish-only`: publish already-prepared package versions

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

## Release Checklist

1. Confirm the target version.
2. Ensure the working tree is clean enough for a release commit.
3. Run verification:
   - `npm test`
   - `npm run check`
4. Dry-run package artifacts:
   - `cd packages/core && npm pack --dry-run`
   - `cd ../cli && npm pack --dry-run`
5. Confirm npm auth:
   - `npm whoami`
6. Publish `@veewo/claw-core` first:
   - `cd packages/core && npm publish --access public`
7. Publish `@veewo/claw` second:
   - `cd ../cli && npm publish --access public`
8. Verify published versions:
   - `npm view @veewo/claw-core version`
   - `npm view @veewo/claw version`
9. Verify install:
   - `npm install -g @veewo/claw`
   - `claw --help`

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

## Remote Install Paths

Before npm publish, remote Windows machines should install from GitHub:

```powershell
git clone https://github.com/chanyuenpang/claw-kit.git
cd claw-kit
powershell -ExecutionPolicy Bypass -File .\scripts\install-cli.ps1
```

After npm publish, the preferred install path becomes:

```powershell
npm install -g @veewo/claw
```

## Notes

- `@veewo/claw` depends on `@veewo/claw-core`, so publish order matters.
- The local executable name remains `claw`.
- `scripts/install-cli.ps1` is the supported GitHub-based Windows bootstrap path until npm publish is live.
