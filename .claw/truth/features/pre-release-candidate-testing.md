# Pre-release candidate testing

<!-- state: current -->
## Current behavior

- Repository-owner release-candidate testing is owned by the repository-local `.agents/skills/test-claw-kit/` package. It is not a published plugin skill and does not replace `release-claw-kit`.
- `test-claw-kit` owns build, static checks, changed/full test routing, failure isolation, artifact smoke checks, optional local development-runtime validation, and the final ready-or-not-ready report.
- The workflow always stops before version changes, commits, pushes, tags, npm or GitHub publication, and maintainer installation refresh. Starting a release requires a separate explicit task using `release-claw-kit`.
- Candidate scope is classified before testing across CLI/core and each affected platform adapter. The workflow preserves the existing working tree and does not stash, clean, or discard user-owned changes to manufacture a passing candidate.
- Build and static checks precede local installation. Changed-file testing supplies the ordinary route; version-level or cross-cutting candidates also use the full route.
- A fail-fast suite does not make unexecuted tail domains disappear. Isolate the reported failure, rerun its focused domain, and explicitly run skipped tail domains before reaching a readiness conclusion.
- Timing- or environment-sensitive failures remain evidence until isolated. Do not delete, skip, weaken, or arbitrarily extend a test to obtain a green result. A fixed discovery-count baseline changes only when an intentionally added test proves that the expected count changed.
- Artifact verification is proportional to the candidate surface: CLI/core changes use package-content smoke checks, while adapter changes use the matching bundle export and bundle tests.
- Local candidate installation is optional and requires explicit user authorization. It uses a development identity: a workspace CLI link may represent the tested CLI, and Codex uses a local marketplace identity such as `claw-kit-local` while the official installation is preserved in disabled state.
- Local Codex verification compares source and cache manifests plus critical-file hashes. The current task cannot claim that a refreshed bundle is loaded; that requires a Codex restart and a new task.
- The final result records the commands and affected domains, failure disposition, relevant artifacts or hashes, residual risk, and an explicit ready or not-ready conclusion without starting release.

## Ownership boundaries

- `.agents/skills/test-claw-kit/SKILL.md` owns entry routing and the no-release boundary.
- `.agents/skills/test-claw-kit/TEMPLATE.json` owns the five ordered execution checkpoints.
- `.agents/skills/test-claw-kit/FALLBACK.md` owns the direct route when the template is unavailable or contributes only part of another stage.
- `.agents/skills/test-claw-kit/CONTENT-COVERAGE.md` maps the contract across those surfaces.
- `.agents/skills/release-claw-kit/` and `.claw/truth/adr/release-0-1-18-publish-and-install-protocol.md` continue to own actual versioning, direct-main delivery, publication, and published-source update closeout.

## Implementation and verification anchors

- `.agents/skills/test-claw-kit/SKILL.md`
- `.agents/skills/test-claw-kit/TEMPLATE.json`
- `.agents/skills/test-claw-kit/FALLBACK.md`
- `.agents/skills/test-claw-kit/CONTENT-COVERAGE.md`
- `.agents/skills/release-claw-kit/SKILL.md`
- `scripts/test-manager.mjs`
- `scripts/test-manager.test.mjs`
- `scripts/codex-plugin-bundle.mjs`
- `scripts/codex-plugin-bundle.test.mjs`

## Search terms

- `test-claw-kit`
- `pre-release candidate testing`
- `fail-fast tail domains`
- `local development identity`
- `claw-kit-local`
- `candidate readiness`
