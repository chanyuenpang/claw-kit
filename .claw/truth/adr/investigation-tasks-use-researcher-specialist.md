# ADR: Investigation tasks use researcher specialist

## Status

Accepted

## Context

`0.1.39` established a host-light, result-blocking researcher dispatch rule. The later completed `Optimize researcher skill for subagent delegation` plan added mandatory same-thread reuse for related investigations and a non-recursive researcher boundary.

The completed `Restrict researcher to code investigation` plan narrowed the role again. Treating project recall, Truth/ADR lookup, and historical-context queries as researcher triggers made a document lookup pay subagent routing and context costs even though `claw search` already provides the direct Codex-facing recall surface. The stable specialist boundary is code investigation: source inspection, symbol or dependency tracing, code architecture analysis, current implementation behavior tracing, and code-evidence gathering before planning or implementation.

Once that role and reuse policy stabilized, repeating main-agent dispatch, input, output, wait, and reuse rules as prose created another drift surface. The delegation contract belongs to the researcher skill that triggers it; it does not need a new core/CLI guidance route. However, leaving the two execution roles implicit in YAML made the host and an assigned researcher infer different entry behavior from the same contract.

## Decision

Codex `researcher` is reserved for code investigation. Ordinary project recall, canonical Truth/ADR lookup, and historical-context queries remain direct main-agent `claw search` work and do not dispatch a researcher.

Narrowing the discovery metadata to code investigation does not remove project-context recall from an already dispatched investigation. The ordered execution contract, including its first `claw search` step before code-index and exact-source inspection, remains solely owned by `.claw/truth/features/codex-subagent-reuse.md`.

Related code investigations reuse a suitable researcher already available in the same thread. The current executable dispatch, reuse, narrow-context, wait, non-recursion, and output contract has one Truth owner: `.claw/truth/features/codex-subagent-reuse.md`. This ADR owns the role-boundary decision and rationale rather than duplicating that operational contract.

Keep the detailed delegation contract once as structured skill-local `delegateSubagents` YAML prompt metadata in `packages/codex-adapter/skills/researcher/SKILL.md`, but precede it with a minimal two-role `Host routing` entry point: the main agent consumes the contract and completes delegation before continuing; an assigned researcher skips delegation, executes the investigation order, and returns `outputContract`. Keep reuse, waiting, input/output, and close policy in YAML rather than duplicating them as prose. Do not extend the typed runtime `workflowGuidance` schema or its generation/injection path for this skill-local contract.

Express the researcher's mutation boundary once in that structured contract as `worker: readonly`. A separate `Boundary` section that restates non-mutation rules is unnecessary because it gives the same role constraint a second owner and weakens the compact positive operational contract.

## Alternatives Considered

- Keep all project investigation and recall under researcher: rejected because document recall is already a direct project capability and does not require a code-investigation subagent.
- Let the main agent perform full code investigation inline: rejected because source and relationship tracing can consume the coordination context and produce large intermediate output.
- Create a new researcher for every code question: rejected because related follow-ups benefit from the existing focused code context; reuse remains mandatory while the role is still suitable.
- Let a researcher recursively dispatch another researcher: rejected because recursive dispatch obscures ownership and expands the wait chain.
- Leave host and assigned-researcher entry behavior implicit in the YAML contract: rejected because each role otherwise has to infer whether it should consume or execute the contract.
- Keep the same dispatch contract as repeated prose: rejected because field ownership is harder to review and equivalent rules can drift apart.
- Retain a separate `Boundary` section alongside `worker: readonly`: rejected because the four negative rules duplicate the structured role constraint instead of adding a distinct safety or authorization boundary.
- Add researcher dispatch fields to typed runtime `workflowGuidance`: rejected because the researcher skill already owns this prompt-time route and no CLI-generated delegation path is required.

## Consequences

- Researcher discovery and prompt wording only advertise code investigation, so ordinary recall does not become a subagent gate.
- The main agent can recover project memory, Truth, ADR, and historical context directly through the recall surface owned by `codex-recall-uses-claw-search.md`.
- Code investigation retains narrow dispatch, same-thread reuse, blocking consumption when the result is required, and non-recursive ownership through the single current Truth owner.
- The researcher skill exposes one compact, testable contract surface with explicit host and worker entry behavior while core/CLI `workflowGuidance` runtime generation remains unchanged.
- Contract consumers can determine the researcher's read-only role from `worker: readonly`; wording review no longer has to reconcile a second `Boundary` section.
- Hook-owned `knowledge-writer` remains the canonical Truth/ADR steward; researcher does not mutate canonical knowledge.

## Related Code

- `packages/codex-adapter/skills/researcher/SKILL.md`
- `packages/codex-adapter/hooks/subagent-contract.test.mjs`
- `.claw/truth/features/codex-subagent-reuse.md`
- `.claw/truth/adr/codex-recall-uses-claw-search.md`

## Search Terms

- `researcher`
- `code investigation`
- `source inspection`
- `symbol tracing`
- `dependency tracing`
- `related researcher reuse`
- `skill-local delegateSubagents`
- `Host routing`
- `Assigned researcher`
- `prompt metadata`
- `worker: readonly`
- `Boundary section`
- `typed workflowGuidance`
- `project recall`
- `Truth/ADR lookup`
- `claw search`
