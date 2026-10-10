---
name: beta-claw-kit
description: Prepare version-incremented local claw-kit candidates with frozen artifacts and unchanged-version promotion, without remote publication.
---
# beta-claw-kit

Read [the beta workflow](../../../docs/beta-release.md). Follow using-claw-kit for the current host lifecycle; use a generic plan when this owns the task, or contribute to the active task.

- Before preparation and again after freezing, resolve the target CLI base and run npm run audit:release-versions -- --phase beta --artifacts <selected-families> (add --candidate after freezing). Show a version worksheet for every platform; partial beta scope is allowed, unselected families are inventory only. A source .0 reset is not a frozen candidate. Formal release must separately reconcile scope and prepare missing/stale authorized platforms before promotion, as described in docs/beta-release.md.
- Every new installable candidate gets a new formal target version, using the selected artifact's existing three-/four-segment rule. Local unpublished candidates reserve their numbers. No beta suffix is added.
- Classify and commit useful source locally on main. Run beta:prepare with the requested artifact set, review/commit the version and dependency changes, then beta:pack --candidate the returned directory. Default is CLI+Codex; add DSH explicitly for a same-source combined candidate. Independent adapter-only work increments only that adapter's fourth segment.
- A failed same-input unfinished preparation uses beta:resume --candidate; it does not allocate a second number. Frozen candidates are reused, never overwritten or rebuilt. New code/inputs require a new candidate and new version.
- Beta is local only: never push/tag/publish. Preserve old candidate/history manifests even when pruning large local artifacts; do not erase allocated version identity.
- For requested testing, install the exact batch, confirm versions and record the seven-day trial with beta:start-test. Installation/restart remain separately authorized. Do not start trial automatically after packaging.
- Formal promotion consumes original tested bytes with unchanged versions: no bump/build/pack/export. CLI/Codex follows its candidate path; DSH uses publish:dsh-plugin -- --candidate <dir> [--publish]. Other artifact owners consume their frozen tree through their existing immutable tag/repository route.
- Report versions, candidate path, source revision and trial status. Never infer published/installed/active state from a successful local pack.
