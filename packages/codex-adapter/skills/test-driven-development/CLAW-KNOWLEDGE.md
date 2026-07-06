# test-driven-development claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\test-driven-development`
- Trigger: use before writing implementation code for features, bug fixes, refactors, or behavior changes.
- Core principle: if you did not watch the test fail first, you do not know whether the test proves the right thing.

## Canonical workflow

1. RED: write one minimal failing test for one behavior.
2. Verify RED: run the test and confirm it fails for the expected reason.
3. GREEN: write the smallest possible production code to pass that test.
4. Verify GREEN: run the test and confirm it passes cleanly, with no broken neighbors.
5. REFACTOR: clean up while keeping everything green.
6. Repeat with the next failing test.

## Hard stop rules

- No production code without a failing test first.
- If implementation code was written before the test, delete it and start over.
- Do not keep prewritten code as reference, adapt it, or peek at it while writing tests.
- Do not treat tests written after implementation as equivalent to TDD.
- Do not skip the verify-red or verify-green checkpoints.

## Good-test rules

- One behavior per test.
- Clear, behavior-oriented name.
- Prefer real code over mocks unless mocks are truly unavoidable.
- Minimal, intention-revealing test shape.

## What to do when a checkpoint fails

- Verify RED:
  If the test passes immediately, it is testing existing behavior or the wrong thing.
  If the test errors instead of failing as expected, fix the test until it fails correctly.
- Verify GREEN:
  If the new test still fails, fix code, not the test.
  If other tests fail, fix the regressions now.
- Refactor:
  Do not add new behavior during cleanup.

## Rationalizations and restart triggers

- "I'll write tests after"
- "I already manually tested it"
- "Keep existing code as reference"
- "This is too simple for TDD"
- "Deleting the code is wasteful"

These are restart signals. The source says to stop and start over with TDD.

## Additional runtime references

- `testing-anti-patterns.md`: for avoiding mock-driven fake tests and test-only production hooks.
- Debugging integration:
  bug fixes should start by writing the failing test that reproduces the bug.

## Why this file exists

- The template stays compact while keeping the TDD cycle and restart rules explicit.
- This file preserves the source's strict ordering, good-test heuristics, and rationalization traps.
