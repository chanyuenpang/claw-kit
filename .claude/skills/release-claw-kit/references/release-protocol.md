# claw-kit release protocol

Run commands from the repository root. Treat current repository files as authority when commands or script names drift.

## Version scheme

| Component | Format | Example | Notes |
|-----------|--------|---------|-------|
| CLI + Core | `MAJOR.MINOR.PATCH` | `0.2.1` | Root `package.json`, `@veewo/claw-core`, `@veewo/claw` share this version. CLI pins core exactly. |
| Codex adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Starts from `.0` after each CLI bump. |
| Cindy adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule. |
| OpenClaw adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule. |
| OpenCode adapter | `CLI_VERSION.PATCH` | `0.2.1.0` | Same 4-segment rule. |
| Codex plugin manifest | `ADAPTER_VERSION` | `0.2.1.0` | Mirrors the codex-adapter package version. No timestamp suffix. |
| Templates | `CLI_VERSION` | `0.2.1` | TEMPLATE.json `version` field follows CLI version. |

Adapters can be published independently: bump their 4th segment, retag with `v<adapter-name>-<version>` (e.g. `vcodex-0.2.1.1`), and do not touch CLI/core packages or other adapters.

## Artifact families and release modes

Select one artifact family before version changes. “Package”, “build”, and “prepare” mean prepare-only unless the user also authorizes commit/push/tag/publish.

| Artifact family | Source scope | Version | Artifact | Tag |
|---|---|---|---|---|
| CLI | core, CLI, or shared CLI/runtime | 3 segments | `@veewo/claw-core` then `@veewo/claw` | `v<version>` |
| Codex | codex-adapter | 4 segments | committed GitHub marketplace snapshot | `vcodex-<version>` |
| Cindy | cindy-adapter | 4 segments | Cindy adapter release artifact | `vcindy-<version>` |
| OpenClaw | openclaw-adapter | 4 segments | OpenClaw adapter release artifact | `vopenclaw-<version>` |
| OpenCode | opencode-adapter | 4 segments | OpenCode adapter release artifact | `vopencode-<version>` |

Routing is explicit: platform requests stay platform-only; CLI/core requests include core and CLI; mixed adapter scopes require an explicit batch decision. Do not use a CLI version request as permission to publish every adapter.

### 1. CLI release (always includes core)

Triggered when core or CLI changes. Publishes `@veewo/claw-core` then `@veewo/claw`, creates a GitHub Release with the tag `v<version>`.

### 2. Codex plugin release

Triggered when codex-adapter changes. Updates the committed marketplace snapshot, tags `vcodex-<version>`, and creates a GitHub Release. No npm publish (adapter is private).

### 3. Cindy, OpenClaw, or OpenCode adapter release

Triggered when exactly one of cindy-adapter, openclaw-adapter, or opencode-adapter changes. Tag with that adapter's tag, no npm publish. The release gate verifier must still pass.

### 4. Prepare-only mode

Use for packaging, export, dry-run, or local verification without an explicit publish request. It may update local version/build outputs, but must stop before commit, push, tag, GitHub Release, npm publish, or maintainer installation refresh.

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

### Version bump checklist

#### CLI release (always includes core)

Update these to the new `MAJOR.MINOR.PATCH` version:

1. Root `package.json` (version)
2. `packages/core/package.json` (version)
3. `packages/cli/package.json` (version; dependency `@veewo/claw-core` pinned exactly)
4. Reset all adapter versions to `<CLI_VERSION>.0`:
   - `packages/codex-adapter/package.json`
   - `packages/cindy-adapter/package.json`
   - `packages/openclaw-adapter/package.json`
   - `packages/opencode-adapter/package.json`
5. `packages/codex-adapter/.codex-plugin/plugin.json` → `<CLI_VERSION>.0` (no timestamp)
6. `packages/openclaw-adapter/package.json` dependency `@veewo/claw-core` pinned exactly

#### Codex-only plugin release

Update only the codex-adapter 4th segment:

1. `packages/codex-adapter/package.json` → `0.2.1.1`
2. `packages/codex-adapter/.codex-plugin/plugin.json` → `0.2.1.1`

Do not touch CLI/core or other adapters.

#### Other adapter-only release

Update only that adapter's 4th segment:

1. `packages/<adapter>/package.json` → `0.2.1.1`

After aligning versions, dependency pins, changelog, and lockfile:

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

Only an empty first command, branch `main`, equal commit hashes, and a successful guarded verifier permit publishing.

### Tagging

| Release type | Tag pattern | Example |
|-------------|------------|---------|
| CLI | `v<version>` | `v0.2.1` |
| Codex plugin | `vcodex-<version>` | `vcodex-0.2.1.0` |
| Cindy | `vcindy-<version>` | `vcindy-0.2.1.0` |
| OpenClaw | `vopenclaw-<version>` | `vopenclaw-0.2.1.0` |
| OpenCode | `vopencode-<version>` | `vopencode-0.2.1.0` |

Never force-move an existing tag without explicit authority.

### CLI publish

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
