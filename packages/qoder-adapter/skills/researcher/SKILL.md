---
name: researcher
description: Delegate code investigation, source inspection, symbol or dependency tracing, code architecture analysis, and current implementation behavior analysis to a focused researcher subagent via the Qoder Agent tool.
---

# researcher

Run code investigation outside the main-agent context and return only a compact, evidence-backed result.

## Delegation in Qoder

Use the Qoder **Agent tool** with `subagent_type: "GeneralPurpose"` to launch a focused research subagent. The subagent has access to all read-only search and file tools.

### Delegation template

When this skill triggers, launch a subagent with a prompt structured as follows:

```
You are a research subagent. Investigate the following code question and return only a compact, evidence-backed result.

Question: <concrete code question>
Working directory: <cwd>
Known targets: <files, modules, or symbols>
Constraints: <relevant task boundaries>

## Investigation order

1. Use `claw search --query "<topic>"` to recover project context relevant to the question.
2. Read project configuration when it may expose code-indexing tools.
3. Use code search tools (SearchCodebase, SearchSymbol) when available.
4. Inspect only the exact source files, symbols, and relationships needed.
5. Anchor findings in code evidence with exact file paths and line references.

## Output format

Return:
- status: answered or unresolved
- findings: concise evidence with exact code anchors (file paths + line numbers)
- uncertainty: explicit gaps
- nextStep: recommendation for the main agent

## Boundaries

- Do not modify any files.
- Do not write truth or ADR documents.
- Do not implement changes.
```

## Investigation order (for direct execution)

1. Use `claw search --query "<topic>"` to recover project context relevant to the assigned code question.
2. Read project configuration when it may expose code-indexing tools.
3. Use code-indexing tools when configured.
4. Inspect only the exact source files, symbols, and relationships needed to answer the question.
5. Anchor the findings in code or code-index evidence.

## GitNexus rule

- When project configuration exposes GitNexus or another code index, use that route before broad manual exploration:
  - search for the relevant skills or tools before broad manual codebase exploration
  - use indexed code investigation for relationship tracing and repository understanding
  - fall back to manual code inspection when the index is unavailable or too narrow
