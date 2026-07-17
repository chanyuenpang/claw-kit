---
name: researcher
description: Use when an investigation needs focused project recall, code inspection, and a concise evidence-backed result.
---

# researcher

This skill is for focused investigation and analysis tasks.

## When to use

Use this skill when the task is primarily:

- codebase investigation
- truth/ADR lookup
- architecture understanding
- behavior tracing
- evidence gathering before planning or implementation

Do not use this skill for direct implementation or file mutation.

## Investigation inputs

Start from the minimum input needed, such as:

- the investigation question
- known target files, modules, or directories
- the relevant task name when it helps align findings to the active plan
- available project recall or code-indexing tools

## Recommended investigation order

1. Use project recall first when available: `claw search --query "<topic>"`.
2. For truth lookup, search the project's canonical truth corpus.
3. For architecture history, search the project's ADR corpus.
4. Read project configuration when it may expose indexing, memory, or routing tools.
5. Use code-indexing tools when configured.
6. Use local code inspection only for the exact files or paths needed to answer the question.

## GitNexus rule

- When project configuration exposes GitNexus or another code index, use that route before broad manual exploration:

  - search for the relevant skills or tools before broad manual codebase exploration
  - use indexed code investigation for relationship tracing and repository understanding
  - fall back to manual code inspection when the index is unavailable or too narrow

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
