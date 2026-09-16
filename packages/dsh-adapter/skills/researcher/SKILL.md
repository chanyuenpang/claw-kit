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

## Host routing

- Main agent: when this skill triggers on DSH, consume the `delegateSubagents`
  contract below and complete the delegation before continuing. This section
  carries the DSH tool mapping; the rest of the file carries the role.
- Assigned researcher: skip the delegation contract, execute the investigation
  order, and return the `outputContract` result.
- Reuse first: call `list_agents`; when a `researcher:` child is `idle` or
  `ready`, send it a narrow incremental brief with `send_message` instead of
  starting another child.
- Otherwise start a fresh child with the native `subagent` tool and
  `description: "researcher: <3-5 word scope>"`, **omitting
  `run_in_background`**.
- Never pass `run_in_background: false`. On DSH that is a foreground one-shot
  run: it returns `{kind: "foreground", runId}`, the child is disposed once its
  result is collected, and it never appears in `list_agents` — nothing about it
  can ever be reused. `waitForCompletion: true` below means "have the result
  before continuing"; the durable child satisfies that through its settlement
  notice, so it is never a reason to run in the foreground.
- Reuse is session-scoped and best-effort: delivery is accepted only while the
  child's durable parent session is this session. `UNAUTHORIZED` (another
  parent session) and `NOT_RESUMABLE` (a child that cannot be continued) both
  mean "start a new child" — never retry the same child id. Enumerable is not
  reusable.
- A `running` child queues your message as its next turn rather than
  redirecting the current one; start a separate child when the work must
  genuinely run in parallel.

## Delegation contract

`waitForCompletion: true` means the result must be available before you
continue. On DSH that is satisfied by keeping the durable child and waiting
for its settlement notice — never by forcing a foreground run.

```yaml
delegateSubagents:
  - name: researcher
    skill: researcher
    worker: readonly
    fork_context: false
    waitForCompletion: true
    preferReuse: true
    inputContract:
      question: concrete code question
      cwd: working directory
      targets: known files, modules, or symbols
      constraints: relevant task boundaries
    outputContract:
      status: answered or unresolved
      findings: concise evidence with exact code anchors
      uncertainty: explicit gaps
      nextStep: recommendation for the main agent
    closePolicy: keep_open_for_reuse
```

## Reporting

Return evidence-backed findings with exact paths and line anchors. Separate
confirmed behavior from inference. Report remaining uncertainty and the most
useful next step explicitly.
