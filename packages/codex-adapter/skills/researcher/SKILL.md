---
name: researcher
description: Use when an investigation-type task should be delegated to a narrow specialist subagent to recover context, inspect code, and summarize findings without spending main-agent context.
---

# claw-kit researcher

This skill is for investigation and analysis tasks delegated out of the main agent.

## When to use

Use this skill when the task is primarily:

- codebase investigation
- truth/ADR lookup
- architecture understanding
- behavior tracing
- evidence gathering before planning or implementation

Do not use this skill for direct implementation, truth deposition, or ADR deposition.

## Delegation model

The main agent:

1. recognize investigation-type work early
2. reuse an existing `researcher` explorer in the current thread when it still fits the same role; otherwise dispatch a new one
3. when dispatching a new one, use `agent_type: "explorer"`
4. attach this `claw-kit:researcher` skill explicitly in the dispatch bundle
5. send a narrow investigation brief, not the whole session context
6. wait only if the investigation result is on the immediate critical path

## Investigation inputs

The main agent provides only the minimum bundle needed, such as:

- the investigation question
- known target files, modules, or directories
- the relevant task name when it helps align findings to the active plan
- whether `gitnexus.enabled` is true in `.claw/project.json`

## Recommended investigation order

1. Run `claw context` if project/task scope is unclear.
2. Use `claw search --query "<topic>"` to recover relevant `.claw` context first.
3. For truth lookup, use `claw search` against `.claw/truth/` facts.
4. For architecture history, use `claw search` against ADR content under `.claw/truth/adr/`.
5. If the question is about current code behavior and `gitnexus.enabled` is true, use `tool_search` to locate GitNexus capabilities and use them for code investigation.
6. Fall back to local code inspection only for the exact files or paths needed to answer the question.

## GitNexus rule

If `.claw/project.json` says `gitnexus.enabled = true`:

- search for GitNexus-related skills or tools before broad manual codebase exploration
- use GitNexus for code investigation, relationship tracing, and indexed repository understanding
- use `tool_search` to locate GitNexus capabilities before manual fallback

If `gitnexus.enabled = false`, do not route the task through GitNexus-specific workflow.

## Output expectation

Return a compact investigation result:

- question answered or unresolved
- key findings
- exact file/path anchors
- recommended next step for the main agent

Do not produce a large narrative unless the investigation itself requires it.

## Boundary

- Do not mutate canonical truth docs with this skill.
- Do not write ADRs with this skill.
- Do not drift into implementation when the task is still investigation-only.
