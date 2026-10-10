# Opencode plugin release fallback

Before selecting any beta or formal candidate, read docs/beta-release.md and resolve the target CLI base and authorized families. Run npm run audit:release-versions with --phase beta|release, --artifacts <authorized-families>, and each frozen --candidate when applicable. Show source/candidate/known-public versions and exact CLI pins for all families. A selected platform with a missing/stale candidate needs fresh latest-source preparation and freezing at that base before promotion; never relabel frozen artifacts or publish an older CLI to disguise mismatch. Other platforms are inventory only until scope expansion is authorized. Each new candidate requires its own trial or explicit owner waiver.

When claw planning is unavailable:

1. Select the explicitly authorized tested frozen candidate for this artifact family. If absent, beta:prepare allocates a new formal version (adapter fourth segment only); review/commit locally, beta:pack --candidate and wait for the new candidate’s own trial or an explicitly recorded owner waiver before publication. No beta suffix or same-version different bytes.
2. Verify the exact sourceRevision, original artifact hash, manifest version/pins and seven-day trial. No bump/build/pack/export or workspace-content repair during promotion; errors requiring new inputs go through a new candidate/version.
3. Require clean source main at the tested revision and no divergence. Complete authorized source delivery without force.
4. Publish the exact frozen opencode tree through its existing immutable vopencode tag and GitHub Release; record source and artifact commits separately and compare public content with the candidate. Never use raw source main as an installable tree, move an existing tag, or publish npm through this artifact skill. Require main == origin/main and a clean worktree at completion.
5. Installation or maintainer refresh must be separately authorized. Preserve the host-specific official installation boundaries in references/artifact.md; installation is not activation and restart needs separate authority.

Follow docs/beta-release.md and references/artifact.md. Stop at the first failed boundary; an accepted/unknown remote write is reconciled rather than blindly resent.
