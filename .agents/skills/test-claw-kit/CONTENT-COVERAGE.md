# test-claw-kit content coverage

## Source to converted-home mapping

- Trigger and release-candidate purpose: `SKILL.md` frontmatter and introduction.
- Whole-task, independent-stage, mixed-stage, and unavailable-tooling routing: `SKILL.md`.
- Absolute no-release boundary: `SKILL.md`, template rules, task 5, and `FALLBACK.md`.
- Candidate and changed-surface classification: template task 1 and fallback step 1.
- Build, static, encoding, template, shared-skill, and manifest checks: template task 2 and fallback step 2.
- Changed/full test selection, fail-fast tail coverage, isolation, and root-cause handling: template task 3 and fallback steps 3-4.
- Package and plugin artifact smoke checks: template task 4 and fallback step 5.
- Explicit-only local CLI/plugin candidate installation, development identity, source/cache parity, and restart boundary: template task 4, template rules, and fallback step 6.
- Evidence-backed ready or not-ready result: template task 5 and fallback step 7.
- Skill-local executable workflow: `TEMPLATE.json` with id `test-claw-kit` and current CLI version.

## Coverage checklist

- [x] Important pre-release testing triggers are represented.
- [x] Whole-task and stage-level claw routing is represented.
- [x] Build, check, test, failure-diagnosis, artifact-smoke, and reporting steps are ordered.
- [x] Version-level and cross-cutting candidates route to the full test surface.
- [x] Fail-fast and timing-sensitive failure handling preserve exact evidence without weakening gates.
- [x] Local installation is explicit-only and isolated from the official plugin identity.
- [x] Codex restart/new-task verification is distinguished from cache installation evidence.
- [x] Release, version, Git, npm, and GitHub mutations are explicitly excluded.
- [x] TEMPLATE.json declares the current claw CLI version.
- [x] A complete plan-independent fallback is available.
