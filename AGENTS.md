# Repository delivery policy

The repository owner uses direct delivery by default.

- When the owner asks to push, publish, sync, or release this repository, work on `main` and push directly to `origin/main`.
- Do not create a feature branch, pull request, or draft PR unless the owner explicitly asks for review or a PR.
- Before a release or direct push, classify every local change. Commit useful repository content; remove disposable output; ignore intentional local-only artifacts. Do not use a stash to bypass a clean-worktree check.
- A release is complete only after local `main` equals `origin/main` and `git status --porcelain` is empty.

## Local beta and promotion

- Every new installable candidate allocates a new intended stable version using the artifact family’s existing release numbering rules, including locally reserved/unpublished versions. Never add a beta suffix or reuse a version for different bytes. Prepare versions, commit source on local `main`, then freeze npm tarballs and composed adapter artifacts. Failed same-input preparation may resume; a frozen candidate is reused, never rebuilt. Beta must never push a branch/tag or publish npm/GitHub artifacts.
- After installation and version confirmation, test the batch locally for seven days. Changed artifacts require a new batch and trial. Never reuse a published version for different bytes.
- Formal promotion publishes the frozen npm tarballs and verifies retrieval before pushing source and releasing the stored adapter tree. Before npm publication require clean local `main` at the candidate revision and no remote divergence; require `main == origin/main` at completion. Do not rebuild or bump versions during promotion. See `docs/beta-release.md`.

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
