# test-claw-kit fallback

Use this direct workflow when `test-claw-kit` contributes to a mixed stage or claw planning is unavailable.

1. Read `AGENTS.md`, package manifests, `git status`, changed paths, and `npm run test:list`. Classify CLI/core and platform-adapter surfaces. Record whether local installation was explicitly requested.
2. Run `npm run build`, `npm run check`, and `git diff --check`. Add template-version, shared-skill, manifest, and encoding checks when those surfaces changed.
3. Run `npm run test:changed`. For version-level or cross-cutting pre-release validation, run `npm run test:full`. If fail-fast execution skips later domains, isolate the failure, rerun its focused domain, and explicitly run the skipped tail domains.
4. Diagnose before fixing. Reproduce timing-sensitive failures in isolation and through the owning domain. Never delete, skip, weaken, or arbitrarily extend a test merely to pass the gate. Update a fixed discovery count only when an intentionally added test proves the baseline changed.
5. Smoke affected artifacts: use package dry-runs for CLI/core and matching export/bundle tests for adapters.
6. Only when explicitly requested, validate the tested workspace locally through a development identity. Keep the global CLI pointed at the tested workspace when CLI changes matter; for Codex use a local marketplace identity, disable rather than delete the official identity, and compare source/cache manifests and critical hashes. A restart and new task are required before claiming the new Codex bundle loaded.
7. Report exact commands, counts, artifact paths, identities, hashes, failure disposition, residual risks, and a ready or not-ready conclusion. Stop before version changes, commits, pushes, tags, npm/GitHub publishing, published-source update, or `release-claw-kit`.
