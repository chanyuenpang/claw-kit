# Real `.claw` Smoke Validation

## Goal

Validate that `claw-kit` can operate against a real existing `.claw` tree derived from `OpenClaw-dev` without requiring migration.

## Fixture strategy

- copy `D:\Users\chany\Documents\OpenClaw-dev\.claw` into a temporary workspace
- do not modify the original `OpenClaw-dev` project
- run `claw-kit` commands and direct `@claw-kit/core` calls against the copied workspace

## Smoke workflow

1. resolve project context from nested `cwd`
2. create a task-bound root plan with `plan write`
3. create a subplan under `plans/` for an existing task scope
4. exercise the requirements exit review gate with a mock reviewer
5. move the plan to `end.completed` with a valid `retrospective.summary`
6. confirm completion hooks are emitted only on first completion
7. write truth under `.claw/truth/`

## Expected pass criteria

- no `.claw` migration step is required
- `.claw/truth/` remains the only canonical truth root
- `TaskMeta.activePlan` updates correctly for root plans and subplans
- task scope remains stable while switching `activePlan` to a subplan
- actionable review feedback forces internal `prepare.review`
- first completion emits truth and ADR candidates

## 2026-06-06 run result

Validated against a copied `OpenClaw-dev/.claw` tree in a temporary workspace.

- nested `cwd` resolved to the copied project `.claw`
- root `plan write` created task scope without requiring any migration
- `prepare.requirements -> process.active` with actionable review feedback was rewritten to internal `prepare.review`
- `prepare.review -> process.active` proceeded without running the same gate twice
- first `end.completed` emitted:
  - `truthCandidate`
  - `adrCandidate`
- repeated terminal edit did not emit completion hooks again
- subplan creation under `plans/child-plan.json` kept task scope stable and moved `activePlan` to the subplan
- truth ingestion wrote only inside `.claw/truth/features/real-smoke-validation.md`

## Notes

- this validation used a mock reviewer through `@claw-kit/core`; the Codex adapter is expected to provide the real reviewer workflow via skills and prompts
- Node 22 `node:sqlite` still emits an experimental warning during memory-related operations
