# Repository delivery policy

The repository owner uses direct delivery by default.

- When the owner asks to push, publish, sync, or release this repository, work on `main` and push directly to `origin/main`.
- Do not create a feature branch, pull request, or draft PR unless the owner explicitly asks for review or a PR.
- Before a release or direct push, classify every local change. Commit useful repository content; remove disposable output; ignore intentional local-only artifacts. Do not use a stash to bypass a clean-worktree check.
- A release is complete only after local `main` equals `origin/main` and `git status --porcelain` is empty.

## Candidate version and promotion policy

Every new installable candidate increments the selected artifact’s normal formal version (including local unpublished allocations), without a beta suffix. Use beta:prepare, commit the prepared manifests locally, then beta:pack --candidate. Same-input unfinished preparation may resume; frozen candidates are reused and never rebuilt. Promotion retains the tested version and exact bytes; it must not bump/build/pack/export. Beta never pushes, tags or publishes. See docs/beta-release.md.

## Release version reconciliation

Before both beta preparation and formal publication, resolve the target CLI base and show a per-family version worksheet (source, selected frozen candidate, known published version, exact CLI pins and DSH npm mapping). Adapter first three segments must match that base; fourth segments remain independent. Run the read-only audit:release-versions command with the beta/release phase and explicitly authorized artifact families; pass each selected frozen candidate with --candidate.

Beta may test only selected platforms. Formal release must re-evaluate the authorized platform scope rather than promote each platform's last beta blindly: prepare and freeze a fresh candidate for a missing/stale selected platform, then promote its unchanged bytes after its own trial or an explicit owner waiver. Never relabel frozen bytes or publish an older CLI merely to hide a stale adapter. Inventory other platforms and request scope expansion before publishing them; unknown remote metadata is not authorization or a publication blocker for unrelated families. See docs/beta-release.md.

# Repository proportional verification and testing policy

Verification and testing should not outweigh the work they protect. Spend more on them only when a concrete and realistically costly regression risk justifies the additional cost.

Account for the total cost of selecting, writing, running, debugging, and maintaining checks. Use TDD only when its expected regression protection justifies that total cost and the behavior is stable enough to assert durably.

- For low-risk changes, use the lightest credible verification. Do not add or run checks whose total cost is greater than the change itself and its realistic regression risk.
- Documentation-only and other non-executable changes do not default to TDD. Prefer review, link or structure checks, examples, or no automated verification when those are proportionate.
- Do not freeze rapidly changing behavior or unsettled contracts behind brittle fine-grained tests. Use smoke checks, probes, or targeted manual verification until the contract stabilizes, then add durable coverage only when the remaining risk justifies it.
- Prefer focused automated tests for high-risk stable behavior, reproduced defects, critical boundaries, and compatibility contracts where regressions would be costly or hard to notice.
- ADRs preserve stable decisions, rationale, and tradeoffs so later changes do not silently reverse them. They complement executable regression tests but do not mechanically require tests for documentation changes or replace tests needed for risky runtime behavior.

# Execute-first validation policy

Validation false positives are first-class usability defects: they can block a correct operation, lose progress, and force unnecessary user recovery.

- Default to calling the authoritative Host/Core business owner once and returning its real result. Do not build stricter adapter-side shadow authorization from tool schemas, catalogs, descriptions, versions, projections, caches, object identity, or optional metadata.
- A preflight hard gate is allowed only for an authoritative fact whose false negative can cause serious, non-recoverable harm that the owner call or a postcondition cannot contain: host-owned identity/workspace/operation scope, path escape, canonical compare-and-set/claim/delivery identity, proven duplicate irreversible effects, or resend after accepted/outcome-unknown.
- Every new or tightened hard gate must document its protected fact, unique owner, authoritative evidence, false-negative harm, false-positive harm, why it cannot be deferred to the owner/postcondition, and its smallest failure scope. Without that proof, remove or downgrade it.
- Keep mutation/send critical sections short: establish identity and target, reserve when needed, acquire the current owner method, persist `attempted`, call exactly once, then persist accepted/rejected/unknown. Never insert advisory capability/catalog/model/version checks after `attempted`.
- Read-only recovery may retry once when proportionate. Never replay a mutation or send after an unknown outcome. Unknown must block only the exact affected resource, not unrelated work.
- Execute-first requires error fidelity: preserve the business owner's structured code and operation phase, redact sensitive details, and use a stable phase-specific fallback only when no safe code exists. Do not collapse actionable rejections into generic `*_FAILED`, add preflights to hide runtime errors, or parse free-form error text as retry authorization.
- Prefer tests that prove owner call counts, canonical outcomes, zero side effects for authority violations, advisory drift tolerance, and no resend. Do not replace removed ceremony with an equal number of brittle metadata snapshots.

See `docs/validation-engineering.md` and `.claw/truth/adr/execute-first-validation-ownership.md`.

# Standard hostless claw workflow entry

This repository runs the claw workflow through the standard hostless flow (no `--host`, no hooks). The full contract lives in `packages/standard-adapter/docs/entry-contract.md` and the `using-claw-kit` skill under `.agents/skills/`; the routing rules are:

1. **Recovered workflow wins.** At the start of a task that may produce reusable project knowledge, run `claw context` (with `CLAW_SESSION_ID` exported for the conversation). If it returns `activeWorkflow`, do not create a plan; follow the recovered `workflowGuidance`.
2. **No knowledge, no plan.** Work that will not deposit reusable knowledge (releases, chores, quick questions) runs directly. For necessary auxiliary tracking, use `--no-knowledge-capture`; the ordinary project workflow initializes automatically and does not expose a storage-scope choice.
3. **Plan before execute.** Otherwise `claw plan create "<title>"` and follow the returned `workflowGuidance` as the only lifecycle contract. Never edit `plan.json` or job files directly.

Closeout is required after `claw plan done`. The hostless default resolves `knowledgeWriter.executionPolicy` to `main-agent`: run `claw knowledge prepare --source agent-memory --project-root <path>`, execute the returned assignments from your own memory, then `claw knowledge complete --source agent-memory --project-root <path> --config-fingerprint <hash>`. With an explicit `background` policy, run the three-step chain instead: inline capture (`claw internal-knowledge-capture` with stdin JSON) → dispatch (`claw internal-knowledge-dispatch --job <jobPath>`) → execute the non-capturing auxiliary writer plan to its terminal transition. Never add `--host`.
