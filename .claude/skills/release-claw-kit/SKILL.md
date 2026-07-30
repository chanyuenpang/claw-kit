---
name: release-claw-kit
description: Repository-local workflow for the claw-kit owner to publish or release a new version, verify its CLI and GitHub marketplace artifacts, and refresh the maintainer Codex installation.
---
# release-claw-kit

Run only inside the claw-kit repository. Apply its guarded release protocol, prove the GitHub and npm artifacts, then hand off to the published-source Codex update phase. Treat repository `AGENTS.md` and the checked-out release code as authoritative.

## Route By Task Ownership

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`.

- Whole task: when this skill fully owns the current task, use `claw plan create --template-file "<skill-dir>/TEMPLATE.json" --title "release-claw-kit"`.
- Independent stage: when this skill fully owns one stage of a broader plan, use `claw subplan create --parent <parent-task-name> --task-id <id> --template-file "<skill-dir>/TEMPLATE.json"`. On hosts with Goal Mode, consume the returned goal handoff so the active parent goal completes before the child plan creates its own goal; never overwrite the parent goal. A batch is a repeated-stage case: invoke this skill once as a subplan for each stage.
- Mixed stage: when this skill only contributes part of a stage that mixes multiple skills, do not create its template plan. Read `FALLBACK.md` and apply the relevant fallback guidance inside the owning workflow.
- Unavailable claw tooling: when the claw CLI or this template is unavailable, read `FALLBACK.md` and run the direct workflow.

After plan or subplan creation, follow the returned `workflowGuidance`. First route the request to exactly one artifact rule; do not let a version request alone select a release mode. A release has two completion boundaries: the artifact release must finish before the maintainer installation refresh begins. Do not install unpublished workspace content as a shortcut.

## Artifact skill routing

Treat this skill as a router, not as one universal release procedure. Record both `artifactFamily` and `deliveryIntent` before changing versions, then read the matching rule file:

| Route | Rule file | Artifact |
|---|---|---|
| `cli` | `rules/cli.md` | `@veewo/claw-core` and `@veewo/claw` |
| `codex` | `rules/codex.md` | Codex GitHub marketplace snapshot |
| `cindy` | `rules/cindy.md` | Cindy plugin release artifact |
| `openclaw` | `rules/openclaw.md` | OpenClaw plugin release artifact |
| `opencode` | `rules/opencode.md` | OpenCode plugin release artifact |
| `prepare-only` | `rules/prepare-only.md` | Local package/export/dry-run only |

Routing is based first on the user's named product, then checked against changed paths. A platform request never routes to `cli`; mixed adapter requests require an explicit batch decision. `prepare-only` stops before commit, push, tag, publish, and maintainer installation refresh.

## Artifact routing

Select exactly one artifact family before changing versions. If the user asks to package or prepare an artifact, use `prepare-only`; do not commit, push, tag, publish, or refresh the maintainer installation unless they explicitly request delivery.

| Artifact family | Changed scope | Version | Published artifact | Tag |
|---|---|---|---|---|
| CLI | `packages/core`, `packages/cli`, or shared CLI/runtime code | `MAJOR.MINOR.PATCH` | `@veewo/claw-core`, then `@veewo/claw` | `v<version>` |
| Codex plugin | `packages/codex-adapter` | `<cli>.N` | GitHub marketplace snapshot | `vcodex-<version>` |
| Cindy plugin | `packages/cindy-adapter` | `<cli>.N` | Cindy adapter GitHub release artifact | `vcindy-<version>` |
| OpenClaw plugin | `packages/openclaw-adapter` | `<cli>.N` | OpenClaw adapter GitHub release artifact | `vopenclaw-<version>` |
| OpenCode plugin | `packages/opencode-adapter` | `<cli>.N` | OpenCode adapter GitHub release artifact | `vopencode-<version>` |

Routing rules:

- A request naming `cli`, `core`, npm, or `@veewo/claw` selects the CLI family and includes core.
- A request naming a platform selects only that platform adapter unless it also explicitly includes CLI/core.
- Changes spanning multiple adapter families require one explicitly named batch; otherwise stop and ask which artifact to release first.
- A CLI release resets every adapter to `<cli>.0`; an adapter release changes only that adapter's fourth segment.
- Never infer a CLI release from a plugin version request, and never publish npm packages for an adapter-only release.

## Release modes

The release protocol supports independent publishing of five artifact families plus a preparation-only mode:

| Mode | Trigger | Publishes | Tag |
|------|---------|-----------|-----|
| **CLI release** | core or CLI changed | `@veewo/claw-core` → `@veewo/claw`, GitHub Release | `v<version>` |
| **Codex plugin release** | codex-adapter changed | Marketplace snapshot, GitHub Release | `vcodex-<version>` |
| **Cindy plugin release** | cindy-adapter changed | GitHub Release only | `vcindy-<version>` |
| **OpenClaw plugin release** | openclaw-adapter changed | GitHub Release only | `vopenclaw-<version>` |
| **OpenCode plugin release** | opencode-adapter changed | GitHub Release only | `vopencode-<version>` |
| **Prepare-only** | User asks to package/build/dry-run without publishing | Local package/bundle only | None |

CLI and adapters use different version formats (3-segment vs 4-segment) and can be published independently (see protocol for version scheme). A CLI release resets all adapter 4th segments to `.0`.

## References

- Release protocol and recovery rules: `references/release-protocol.md`
- Fallback: `FALLBACK.md`
- Content coverage: `CONTENT-COVERAGE.md`
- Template: `TEMPLATE.json`
