# ADR: Separate pre-release candidate testing from release

## Status

Accepted

## Context

The repository already has a guarded `release-claw-kit` workflow that changes versions, delivers source, publishes artifacts, and closes published-source installation state. Maintainers also need to build, test, package-smoke, and sometimes install an unpublished workspace candidate before deciding whether any release should begin.

Embedding those checks only inside the release workflow couples evidence gathering to delivery authority. It also makes local workspace installation easy to confuse with published-source verification, and a fail-fast test run can obscure domains that never executed.

## Decision

- Create a separate repository-local `test-claw-kit` skill package for release-candidate and pre-release version testing.
- Keep this workflow non-delivering: it may diagnose and fix a confirmed candidate regression, but it does not change versions, commit, push, tag, publish, invoke `release-claw-kit`, or claim published-source verification.
- Require candidate-surface classification, build and static checks, release-quality test routing, failure isolation, skipped-tail accounting, proportional artifact smoke checks, and an explicit ready or not-ready result.
- Permit local installation only when the user explicitly requests runtime validation. **Package identity is invariant across published, unpublished, local, dirty, and development builds:** DSH plugin candidates always retain the canonical `@veewo/dsh-claw-kit` npm name, bundle module ID, and client factory ID. No build/export/install path may rewrite the package name to `@veewo/dsh-claw-kit-dev` or any other dev alias. Use a prerelease/build version, absolute artifact provenance and digest, and an explicitly identified local Profile to distinguish candidate bytes. Codex marketplace isolation may use a local marketplace identity without changing any npm package name. No local install implies release or published-source verification.
- Treat test failures as evidence. Timing-sensitive failures are isolated in their owning domain, and fixed discovery baselines change only when an intentional test addition proves the expected count changed; gates are not weakened merely to obtain a pass.
- Keep actual release and published-source update authority in `release-claw-kit` and the accepted release protocol. Candidate readiness is input to a later explicit release decision, not authorization to release.

## Alternatives

- Extend `release-claw-kit` to cover every candidate-only request. Rejected because build/test work would inherit versioning and delivery semantics that the user did not authorize.
- Use an informal command checklist without a skill. Rejected because cross-package test routing, fail-fast tail coverage, local identity isolation, and evidence reporting are stable enough to warrant one maintained workflow contract.
- Install the candidate over the official Codex marketplace identity. Rejected because it destroys the evidence boundary between unpublished development content and the published marketplace installation.
- Rename a DSH candidate npm package to `@veewo/dsh-claw-kit-dev`, even when it will never be published. Rejected: publication intent does not change runtime identity. Name rewriting changes loader-facing module/client IDs, leaves project-level collector descriptors tied to a discarded package, and cannot substitute for explicit local artifact provenance.
- Accept the first isolated pass after a full-suite failure. Rejected because fail-fast execution may leave later domains unexecuted, and an isolated pass alone does not account for the candidate's remaining surface.

## Consequences

- Maintainers can validate a dirty or unpublished workspace without implicitly authorizing release delivery.
- Release evidence requires the recorded profile, absolute local artifact provenance and digest: the canonical DSH package name alone never proves that the bytes came from the published registry. Candidate installs must not be reported as published-source verification.
- Full and changed-file routes retain exact failure evidence, and skipped tail domains must be made explicit before readiness is claimed.
- The repository maintains two adjacent workflows and must keep their boundary clear: `test-claw-kit` ends at readiness, while `release-claw-kit` owns delivery and publication.
- The current behavioral owner is `.claw/truth/features/pre-release-candidate-testing.md`.

<!-- state: history -->
## Decision evolution

<!-- dated: 2026-10-01 -->
### Dev package alias caused a DSH collector outage

A locally installed `@veewo/dsh-claw-kit-dev` replaced the canonical package while a project report-collector descriptor still pointed to `@veewo/dsh-claw-kit`. Seven knowledge finalizers spawned 18 workers but all failed before claim with `REPORT_COLLECTOR_FAILED: dsh`. The incident confirmed that an unpublished build must preserve package identity; local provenance and versioning, not package-name mutation, own candidate distinction.

## Related code

- `.agents/skills/test-claw-kit/SKILL.md`
- `.agents/skills/test-claw-kit/TEMPLATE.json`
- `.agents/skills/test-claw-kit/FALLBACK.md`
- `.agents/skills/test-claw-kit/CONTENT-COVERAGE.md`
- `.agents/skills/release-claw-kit/SKILL.md`
- `scripts/test-manager.mjs`
- `scripts/test-manager.test.mjs`

## Search terms

- `separate candidate testing from release`
- `test-claw-kit`
- `release-claw-kit boundary`
- `development identity`
- `fail-fast tail domains`
