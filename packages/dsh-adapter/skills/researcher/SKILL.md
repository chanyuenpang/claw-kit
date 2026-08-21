---
name: researcher
description: Use for complex research questions that require an independent, multi-step process of gathering and synthesizing evidence—not direct fact lookups or routine searches.
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

1. Use project recall first when available: `claw_run` operation `search` with
   `query` — it recalls project memory, truth, ADR, and declared docs before
   broader investigation.
2. For truth lookup, search the project's canonical truth corpus
   (`.claw/truth`).
3. For architecture history, search the project's ADR corpus.
4. Read project configuration when it may expose indexing, memory, or routing
   tools (`.claw/project.json` + `project-override.json`).
5. Use code-indexing tools when configured (GitNexus or another code index).
6. Use local code inspection only for the exact files or paths needed to answer
   the question — DSH's own `read`/`glob`/`grep` tools, not broad manual
   exploration.

The order is: `claw_run search` → configured code index → exact source
inspection. Do not skip recall for direct `rg`-style exploration in an
initialized project.

## GitNexus rule

- When project configuration exposes GitNexus or another code index, use that
  route before broad manual exploration:

  - search for the relevant skills or tools before broad manual codebase
    exploration
  - use indexed code investigation for relationship tracing and repository
    understanding
  - read project configuration to discover enabled capabilities
  - when a configured code index is unavailable, proceed with the remaining
    route without it

## DSH delegation (optional)

For large or clearly independent investigations, delegate to a DSH native
subagent (`subagent`/`subagent_fork`) in the background:

- make the prompt self-contained: question, known anchors, expected evidence
  shape, and the required report fields (status / findings with exact
  file:line anchors / uncertainty / nextStep);
- prefer `run_in_background: true` and continue other work while it runs;
- the child reports back; fold its findings into your own response with
  attribution.

Do not delegate when the investigation is small enough to do inline — a
subagent is for bounded, independent scopes, not a substitute for reading a
file.

## Reporting

Return evidence-backed findings with exact paths and line anchors. Separate
confirmed behavior from inference. Report remaining uncertainty and the most
useful next step explicitly.
