# ADR: Investigation tasks use researcher specialist

## Status

Accepted

## Context

`0.1.39` established a host-light, result-blocking researcher dispatch rule. The later completed `Optimize researcher skill for subagent delegation` plan added mandatory same-thread reuse for related investigations and a non-recursive researcher boundary.

The completed `Restrict researcher to code investigation` plan narrowed the role again. Treating project recall, Truth/ADR lookup, and historical-context queries as researcher triggers made a document lookup pay subagent routing and context costs even though `claw search` already provides the direct Codex-facing recall surface. The stable specialist boundary is code investigation: source inspection, symbol or dependency tracing, code architecture analysis, current implementation behavior tracing, and code-evidence gathering before planning or implementation.

Once that role and reuse policy stabilized, repeating main-agent dispatch, input, output, wait, and reuse rules as prose created another drift surface. The delegation contract belongs to the researcher skill that triggers it; it does not need a new core/CLI guidance route. However, leaving the two execution roles implicit in YAML made the host and an assigned researcher infer different entry behavior from the same contract.

## Decision

Use researcher for bounded complex investigations requiring independent multi-step evidence synthesis, not routine recall or direct fact lookup. The shared package now permits code, behavior, architecture and project Truth/ADR questions; the older code-only discovery boundary below is historical context, not current scope.

Keep the role contract in [the canonical researcher package](<../../../.agents/skills/researcher/SKILL.md>) and executable mappings in its adjacent references/host-execution.md; artifact distribution follows the shared-source owner. The YAML describes a read-only role, narrow context, result-before-dependent-work and preferred reuse, not literal tool arguments or new typed runtime guidance fields. Main agents disclose each assignment and use the actual host tools; assigned researchers investigate directly without recursive delegation. Reuse is preferred when a suitable known worker and host capability exist, not a guarantee across transports.

Current Codex behavior belongs to [Codex researcher Truth](<../features/codex-subagent-reuse.md>); shared distribution belongs to [shared-source Truth](<../features/shared-planning-skill-source.md>).

## Alternatives

- Keep all project investigation and recall under researcher: rejected because document recall is already a direct project capability and does not require a code-investigation subagent.
- Let the main agent perform full code investigation inline: rejected because source and relationship tracing can consume the coordination context and produce large intermediate output.
- Create a new researcher for every code question: rejected because related follow-ups benefit from the existing focused code context; reuse remains preferred when the role is suitable and the host supports it.
- Let a researcher recursively dispatch another researcher: rejected because recursive dispatch obscures ownership and expands the wait chain.
- Leave host and assigned-researcher entry behavior implicit in the YAML contract: rejected because each role otherwise has to infer whether it should consume or execute the contract.
- Keep the same dispatch contract as repeated prose: rejected because field ownership is harder to review and equivalent rules can drift apart.
- Retain a separate `Boundary` section alongside `worker: readonly`: rejected because the four negative rules duplicate the structured role constraint instead of adding a distinct safety or authorization boundary.
- Add researcher dispatch fields to typed runtime `workflowGuidance`: rejected because the researcher skill already owns this prompt-time route and no CLI-generated delegation path is required.

## Consequences

- Researcher discovery advertises complex independent investigation; ordinary recall still does not become a subagent gate.
- The main agent can recover project memory, Truth, ADR, and historical context directly through the recall surface owned by `codex-recall-uses-claw-search.md`.
- Code investigation retains narrow dispatch, same-thread reuse, blocking consumption when the result is required, and non-recursive ownership through the single current Truth owner.
- The researcher skill exposes one compact, testable contract surface with explicit host and worker entry behavior while core/CLI `workflowGuidance` runtime generation remains unchanged.
- Contract consumers can determine the researcher's read-only role from `worker: readonly`; wording review no longer has to reconcile a second `Boundary` section.
- Hook-owned `knowledge-writer` remains the canonical Truth/ADR steward; researcher does not mutate canonical knowledge.

## Related Code

- [Researcher source](<../../../.agents/skills/researcher/SKILL.md>)
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
