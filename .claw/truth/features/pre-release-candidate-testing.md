# Pre-release candidate testing

<!-- state: current -->
## Current behavior

- Repository-owner release-candidate testing is owned by the repository-local `.agents/skills/test-claw-kit/` package. It is not a published plugin skill and does not replace `release-claw-kit`.
- `test-claw-kit` owns build, static checks, changed/full test routing, failure isolation, artifact smoke checks, optional local development-runtime validation, and the final ready-or-not-ready report.
- The workflow always stops before version changes, commits, pushes, tags, npm or GitHub publication, and maintainer installation refresh. Starting a release requires a separate explicit task using `release-claw-kit`.
- Candidate scope is classified before testing across CLI/core and each affected platform adapter. The workflow preserves the existing working tree and does not stash, clean, or discard user-owned changes to manufacture a passing candidate.
- Build and static checks precede local installation. Changed-file testing supplies the ordinary route; version-level or cross-cutting candidates also use the full route.
- DSH has a first-class `dsh` test-manager domain; both DSH source routing and the full suite run `@veewo/dsh-claw-kit` runtime tests rather than treating a successful root build as adapter verification.
- A fail-fast suite does not make unexecuted tail domains disappear. Isolate the reported failure, rerun its focused domain, and explicitly run skipped tail domains before reaching a readiness conclusion.
- Timing- or environment-sensitive failures remain evidence until isolated. Do not delete, skip, weaken, or arbitrarily extend a test to obtain a green result. A fixed discovery-count baseline changes only when an intentionally added test proves that the expected count changed.
- Artifact verification is proportional to the candidate surface: CLI/core changes use package-content smoke checks, while adapter changes use the matching bundle export and bundle tests.
- Local candidate installation is optional and requires explicit user authorization. A workspace CLI link may represent the tested CLI. DSH package identity is immutable across published, unpublished, local, dirty, and development builds: npm name, bundle id and client factory id remain `@veewo/dsh-claw-kit`, and no export/build/install path may rewrite them to a `-dev` alias. Candidate provenance is carried by version/build metadata, absolute artifact path and digest, and the named local Profile. Codex may use a separate local marketplace identity such as `claw-kit-local` while its official marketplace installation remains preserved.
- Local Codex verification compares source and cache manifests plus critical-file hashes. The current task cannot claim that a refreshed bundle is loaded; that requires a Codex restart and a new task.
- The final result records the commands and affected domains, failure disposition, relevant artifacts or hashes, residual risk, and an explicit ready or not-ready conclusion without starting release.

## Versioned local candidate preparation

- Every new installable candidate allocates a new formal version under its artifact family's normal numbering rule, counting local allocations as well as published versions. CLI/core uses its three-segment line; standalone adapters advance their own compatible adapter version, while combined candidates keep the selected family versions/dependencies aligned. No beta suffix is added; DSH retains its existing four-segment-to-npm rc mapping.
- `beta:prepare` is the version-allocation owner: it records preparing inputs and supports same-input resume; prepared manifests/dependencies are committed before `beta:pack --candidate` freezes the exact source revision and selected artifacts. A frozen candidate is reused, never rebuilt for promotion.
- Promotion preserves the tested version and exact frozen bytes: publish the original CLI/DSH tarball or corresponding frozen adapter tree, with no bump, build, pack, or export. Unknown/accepted upload outcomes are reconciled against the exact registry resource and never blindly resent. Trial duration binds the exact candidate hash.
- Old same-version batches remain historical and are not overwritten. A failed or changed post-freeze candidate requires a newly numbered candidate; routine validation, retry, install, and promotion do not allocate a new number.

- Versioned beta preparation is a separate authorized route from read-only/test-claw-kit readiness checks; it does not grant publication, installation, restart, or trial-start authority. A frozen schema2 candidate records selected families, exact source revision, and artifact hashes; legacy frozen schema1 remains readable.

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

<!-- state: history -->
## Evolution history

<!-- dated: 2026-10-01 -->
### Package-name mutation prohibited after collector outage

A `@veewo/dsh-claw-kit-dev` local package left project-scoped report collectors pointing at the discarded canonical path, causing repeated knowledge finalizer claim failures. Candidate distinction moved entirely to provenance and version metadata; package identity is no longer a development-isolation mechanism.

## Search terms

- `test-claw-kit`
- `pre-release candidate testing`
- `fail-fast tail domains`
- `canonical DSH npm identity`
- `claw-kit-local`
- `candidate readiness`
