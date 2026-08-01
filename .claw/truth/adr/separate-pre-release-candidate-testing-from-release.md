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
- Permit local installation only when the user explicitly requests development-runtime validation. Such installation uses a development identity and preserves the official installation rather than replacing or deleting it.
- Treat test failures as evidence. Timing-sensitive failures are isolated in their owning domain, and fixed discovery baselines change only when an intentional test addition proves the expected count changed; gates are not weakened merely to obtain a pass.
- Keep actual release and published-source update authority in `release-claw-kit` and the accepted release protocol. Candidate readiness is input to a later explicit release decision, not authorization to release.

## Alternatives considered

- Extend `release-claw-kit` to cover every candidate-only request. Rejected because build/test work would inherit versioning and delivery semantics that the user did not authorize.
- Use an informal command checklist without a skill. Rejected because cross-package test routing, fail-fast tail coverage, local identity isolation, and evidence reporting are stable enough to warrant one maintained workflow contract.
- Install the candidate over the official Codex identity. Rejected because it destroys the evidence boundary between unpublished development content and the published marketplace installation.
- Accept the first isolated pass after a full-suite failure. Rejected because fail-fast execution may leave later domains unexecuted, and an isolated pass alone does not account for the candidate's remaining surface.

## Consequences

- Maintainers can validate a dirty or unpublished workspace without implicitly authorizing release delivery.
- Release evidence is easier to interpret because candidate-only local identities cannot be mistaken for official published-source state.
- Full and changed-file routes retain exact failure evidence, and skipped tail domains must be made explicit before readiness is claimed.
- The repository maintains two adjacent workflows and must keep their boundary clear: `test-claw-kit` ends at readiness, while `release-claw-kit` owns delivery and publication.
- The current behavioral owner is `.claw/truth/features/pre-release-candidate-testing.md`.

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
