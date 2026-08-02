# Repository delivery policy

The repository owner uses direct delivery by default.

- When the owner asks to push, publish, sync, or release this repository, work on `main` and push directly to `origin/main`.
- Do not create a feature branch, pull request, or draft PR unless the owner explicitly asks for review or a PR.
- Before a release or direct push, classify every local change. Commit useful repository content; remove disposable output; ignore intentional local-only artifacts. Do not use a stash to bypass a clean-worktree check.
- A release is complete only after local `main` equals `origin/main` and `git status --porcelain` is empty.

# Repository proportional verification and testing policy

Verification and testing should not outweigh the work they protect. Spend more on them only when a concrete and realistically costly regression risk justifies the additional cost.

Account for the total cost of selecting, writing, running, debugging, and maintaining checks. Use TDD only when its expected regression protection justifies that total cost and the behavior is stable enough to assert durably.

- For low-risk changes, use the lightest credible verification. Do not add or run checks whose total cost is greater than the change itself and its realistic regression risk.
- Documentation-only and other non-executable changes do not default to TDD. Prefer review, link or structure checks, examples, or no automated verification when those are proportionate.
- Do not freeze rapidly changing behavior or unsettled contracts behind brittle fine-grained tests. Use smoke checks, probes, or targeted manual verification until the contract stabilizes, then add durable coverage only when the remaining risk justifies it.
- Prefer focused automated tests for high-risk stable behavior, reproduced defects, critical boundaries, and compatibility contracts where regressions would be costly or hard to notice.
- ADRs preserve stable decisions, rationale, and tradeoffs so later changes do not silently reverse them. They complement executable regression tests but do not mechanically require tests for documentation changes or replace tests needed for risky runtime behavior.
