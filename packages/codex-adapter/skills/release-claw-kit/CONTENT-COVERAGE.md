# release-claw-kit content coverage

## Source to converted-home mapping

- Triggers and task-ownership routing: `SKILL.md`.
- Whole-task and independently owned stage entry: `SKILL.md` routes to the adjacent `TEMPLATE.json`; mixed stages and unavailable tooling route to `FALLBACK.md`.
- Repository authority and distribution model: template tasks 1-2 and `references/release-protocol.md`, grounded in root `AGENTS.md`, `DISTRIBUTION.md`, and the release ADR.
- Version alignment, generated template synchronization, lockfile, changelog, and plugin manifest: template task 2.
- Proportional verification: template task 3 and the protocol reference.
- Direct-main commit/push and exact-source release gate: template task 4.
- Guarded verifier, immutable tag, GitHub Release without a plugin ZIP, and core-before-CLI publishing: template task 5.
- GitHub, registry metadata/retrieval, committed marketplace payload, and clean repository evidence: template task 6.
- Separate published-source maintainer update boundary: template tasks 7-8.
- Failure recovery and plan-independent execution: `references/release-protocol.md` and `FALLBACK.md`.
- Template compatibility: `TEMPLATE.json` version equals the current claw release version and is advanced by `npm run sync:template-versions` during future releases.

## Coverage checklist

- [x] Important release and update triggers are represented.
- [x] Ordered preparation, verification, push, publish, evidence, and update steps are represented.
- [x] Prepared targets, explicit narrower modes, registry delay, existing versions/tags, and failing gates have defined behavior.
- [x] Required scripts, commands, artifacts, and authority documents are linked.
- [x] Repository-only policy remains authoritative in `AGENTS.md` instead of being generalized for unrelated projects.
- [x] Verification requirements are proportional and preserve the hard release gates.
- [x] `TEMPLATE.json` declares the current claw CLI version.
- [x] A complete direct fallback is available without claw planning.
