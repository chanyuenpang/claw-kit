# systematic-debugging claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\systematic-debugging`
- Trigger: use when encountering any bug, test failure, unexpected behavior, build failure, integration issue, or similar technical problem before proposing fixes.
- Core principle: always find root cause before attempting fixes. Symptom fixes are failure.

## Canonical workflow

1. Phase 1: root cause investigation.
2. Phase 2: pattern analysis.
3. Phase 3: hypothesis and testing.
4. Phase 4: implementation and verification.
5. If repeated fix attempts fail, stop and question the architecture instead of piling on more fixes.

## Phase 1: Root Cause Investigation

- Read error messages carefully.
- Reproduce consistently.
- Check recent changes.
- In multi-component systems, add diagnostic instrumentation at each boundary and gather evidence before proposing fixes.
- Trace data flow back to the source of the bad value or failing state.

## Phase 2: Pattern Analysis

- Find working examples in the codebase.
- Compare against references completely, not partially.
- Identify all differences between working and broken paths.
- Understand dependencies, assumptions, config, and environment.

## Phase 3: Hypothesis and Testing

- Form one explicit hypothesis at a time.
- Test minimally, changing one variable.
- Verify before continuing.
- If the hypothesis fails, return to investigation instead of stacking more fixes.
- If you don't understand something, say so and research or ask for help.

## Phase 4: Implementation

- Create a failing test or minimal reproduction first.
- Implement a single fix that addresses the identified root cause.
- Verify the fix and check regressions.
- If the fix does not work:
  - fewer than 3 attempts -> return to Phase 1 with new evidence
  - 3 or more failed attempts -> stop and question the architecture before another fix

## Hard stop and escalation rules

- No fixes without Phase 1.
- No quick symptom patches.
- No multiple fixes at once.
- No skipping tests or relying only on manual verification.
- No "one more fix" after repeated failures without architectural discussion.
- If each fix reveals new coupling or a problem elsewhere, treat that as an architecture signal, not a normal failed hypothesis.

## High-value references and techniques

- `root-cause-tracing.md`: for tracing backward through deep call stacks.
- `defense-in-depth.md`: for adding layered validation after root cause is found.
- `condition-based-waiting.md`: for replacing arbitrary timeouts.
- Related skills:
  `test-driven-development` for failing tests and `verification-before-completion` for final proof.

## Partner redirection signals

- "Is that not happening?" -> you assumed without verifying.
- "Will it show us...?" -> you skipped evidence gathering.
- "Stop guessing" -> you proposed solutions without understanding.
- "Ultrathink this" -> question architecture, not just symptoms.

## Why this file exists

- The template stays compact while preserving the debugging discipline and stop conditions.
- This file keeps the phase details, architecture-escalation rule, and supporting-technique routing explicit.
