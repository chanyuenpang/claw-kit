# claw-kit Closeout Workflow

This document defines the standard closeout behavior for `claw-kit`.

Default closeout includes three actions:

1. Update version numbers
2. Update the locally installed copy
3. `commit + push`

Workflow closeout also includes two required checks after task execution:

1. confirm the workflow actually dispatched `truth-writer` and `adr-writer` when the returned contract required them
2. if this task has a git commit flow, inspect the repo for task-related doc artifacts and include them in the same commit instead of leaving them behind

## 1. Update version numbers

Keep these files aligned for a release:

1. [package.json](/D:/Users/chany/Documents/claw-kit/package.json)
2. [package-lock.json](/D:/Users/chany/Documents/claw-kit/package-lock.json)
3. [packages/core/package.json](/D:/Users/chany/Documents/claw-kit/packages/core/package.json)
4. [packages/cli/package.json](/D:/Users/chany/Documents/claw-kit/packages/cli/package.json)
5. [packages/codex-adapter/package.json](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/package.json)
6. [packages/openclaw-adapter/package.json](/D:/Users/chany/Documents/claw-kit/packages/openclaw-adapter/package.json)
7. [packages/opencode-adapter/package.json](/D:/Users/chany/Documents/claw-kit/packages/opencode-adapter/package.json)
8. [packages/codex-adapter/.codex-plugin/plugin.json](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/.codex-plugin/plugin.json)
9. [packages/core/src/templates/plans/default.ts](/D:/Users/chany/Documents/claw-kit/packages/core/src/templates/plans/default.ts)
10. Every plugin `TEMPLATE.json` under `shared/skills`, `packages/codex-adapter/skills`, and `packages/opencode-adapter/skills`

Rules:

- Keep workspace package versions aligned unless there is a strong reason not to.
- Use `semver+codex.<timestamp>` for the plugin manifest version.
- After changing the root package version, run `npm run sync:template-versions`. It updates plugin template versions and the built-in default template from `package.json.version`.
- Run `npm run sync:shared-skills` after template-version synchronization, then run `npm run check:template-versions`. Never publish by editing only a subset of materialized template copies.
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

Verification standard:

```powershell
npm list -g @veewo/claw --depth=0
(Get-Command claw).Source
claw --help
```

Pass criteria:

1. the reported global `@veewo/claw` version matches the release target
2. `claw` resolves from `C:\Users\chany\AppData\Roaming\npm\claw.ps1`
3. the command surface is reachable through `claw --help`

### 2.2 Published Codex marketplace and official cache

When `packages/codex-adapter` changes, publish and verify the new release first. Then invoke the update skill; its maintained installer clones the published GitHub marketplace and refreshes:

```text
C:\Users\chany\.codex\plugins\cache\claw-kit\claw-kit\<plugin-version>\
```

At minimum sync:

1. `.codex-plugin/`
2. `hooks/`
3. `references/`
4. `scripts/`
5. `skills/`
6. `package.json`

After update, confirm:

1. the published Git marketplace and cache `plugin.json` have the expected version
2. `hooks.json` matches the current implementation
3. updated skills and references are present in the official cache
4. `config.toml` enables `claw-kit@claw-kit` and disables `claw-kit@claw-kit-local`

Recommended verification commands:

```powershell
Get-Content packages/codex-adapter/.codex-plugin/plugin.json
Get-Content C:\Users\chany\.codex\plugins\cache\claw-kit\claw-kit\<plugin-version>\.codex-plugin\plugin.json
Get-ChildItem C:\Users\chany\.codex\plugins\cache\claw-kit\claw-kit
```

Pass criteria:

1. published repository and cached manifest versions are identical
2. the enabled plugin identity is `claw-kit@claw-kit`
3. `claw-kit@claw-kit-local` is disabled
4. the expected cache directory exists under `claw-kit\claw-kit\<plugin-version>\`

## 3. commit + push

Before commit:

1. `npm test`
2. `npm run check`
3. `git status --short`
4. verify local CLI and plugin cache if the release surface changed
5. verify whether this task round required `truth-writer` or `adr-writer`, and confirm those delegations actually happened
6. if this task round produced canonical truth, ADR, or other task-scoped docs, make sure they are either intentionally excluded or staged with the same commit

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
- If the workflow contract called for `truth-writer` or `adr-writer`, verify the dispatch happened before calling the task fully closed out.
- If the task produced round-specific docs that still belong to the shipped change, do not leave them as residue outside the commit.

## Recommended order

1. Finish the feature or fix
2. Run verification
3. Update version numbers
4. Run `npm run sync:template-versions`
5. Run `npm run sync:shared-skills`
6. Run `npm run check:template-versions`
7. Run `npm install`
8. Run `npm run build`
9. Update the locally installed CLI
10. Update the local Codex plugin cache if needed
11. Check canonical `.claw` changes
12. Confirm writer delegation and remaining task doc artifacts
13. Verify local CLI and plugin cache versions
14. `git commit`
15. `git push`

## Notes

- For npm publishing, complete this closeout first and then follow [DISTRIBUTION.md](/D:/Users/chany/Documents/claw-kit/DISTRIBUTION.md).
- For normal feature delivery without release intent, version bumps can be skipped, but the default recommendation is still to keep the release surface current.
