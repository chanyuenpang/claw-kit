# claw-kit Closeout Workflow

This document defines the standard closeout behavior for `claw-kit`.

Default closeout includes three actions:

1. Update version numbers
2. Update the locally installed copy
3. `commit + push`

## 1. Update version numbers

Keep these files aligned for a release:

1. [package.json](/D:/Users/chany/Documents/claw-kit/package.json)
2. [package-lock.json](/D:/Users/chany/Documents/claw-kit/package-lock.json)
3. [packages/core/package.json](/D:/Users/chany/Documents/claw-kit/packages/core/package.json)
4. [packages/cli/package.json](/D:/Users/chany/Documents/claw-kit/packages/cli/package.json)
5. [packages/codex-adapter/package.json](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/package.json)
6. [packages/openclaw-adapter/package.json](/D:/Users/chany/Documents/claw-kit/packages/openclaw-adapter/package.json)
7. [packages/codex-adapter/.codex-plugin/plugin.json](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/.codex-plugin/plugin.json)

Rules:

- Keep workspace package versions aligned unless there is a strong reason not to.
- Use `semver+codex.<timestamp>` for the plugin manifest version.
- Run `npm install` after editing package versions so `package-lock.json` stays consistent.

## 2. Update the locally installed copy

### 2.1 Local CLI

Preferred local install path:

```powershell
npm install -g @veewo/claw
```

One-shot Windows install script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-cli.ps1
```

### 2.2 Local Codex plugin cache

When `packages/codex-adapter` changes, sync the local Codex plugin cache under:

```text
C:\Users\chany\.codex\plugins\cache\claw-kit-local\claw-kit\<plugin-version>\
```

At minimum sync:

1. `.codex-plugin/`
2. `hooks/`
3. `references/`
4. `scripts/`
5. `skills/`
6. `package.json`

After sync, confirm:

1. `plugin.json` has the expected version
2. `hooks.json` matches the current implementation
3. updated skills and references are present in cache

## 3. commit + push

Before commit:

1. `npm test`
2. `npm run check`
3. `git status --short`

Standard sequence:

```powershell
git add <changed-files>
git commit -m "<message>"
git push origin main
```

Requirements:

- Do not commit unverified changes.
- If [`.claw/project.json`](/D:/Users/chany/Documents/claw-kit/.claw/project.json) or [`.claw/truth/`](/D:/Users/chany/Documents/claw-kit/.claw/truth) changed canonically, include them in the release commit.
- If writer specialists updated truth or ADR during closeout, include those final canonical changes before `git push`.

## Recommended order

1. Finish the feature or fix
2. Run verification
3. Update version numbers
4. Run `npm install`
5. Run `npm run build`
6. Update the locally installed CLI
7. Update the local Codex plugin cache if needed
8. Check canonical `.claw` changes
9. `git commit`
10. `git push`

## Notes

- For npm publishing, complete this closeout first and then follow [DISTRIBUTION.md](/D:/Users/chany/Documents/claw-kit/DISTRIBUTION.md).
- For normal feature delivery without release intent, version bumps can be skipped, but the default recommendation is still to keep the release surface current.
