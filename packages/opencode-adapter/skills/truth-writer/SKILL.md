---
name: truth-writer
description: Use when durable findings, completed task reports, or reusable project knowledge should be deposited into a canonical truth corpus.
---

# truth writer

Primary reference:

- `../../references/TRUTH-AGENT-SPEC.md`

## Purpose

Turn reports, code discoveries, or completed task outcomes into durable canonical truth.
In claw-kit projects, the canonical truth corpus lives under `.claw/truth/`.

## Delegation model

This skill is a dedicated deposition worker.
The caller provides a curated completed task report, investigation report, or equivalent finding bundle containing the reusable facts and evidence that must be recorded.
The writer judges whether the input contains reusable truth, then updates the canonical truth corpus.

## What truth is for

Truth docs should help future agents:

- investigate faster
- locate code faster
- understand stable constraints and behavior

## Durable deposition

Prefer writing truth when the material contains:

- stable architecture facts
- durable feature behavior
- important debugging or routing knowledge
- long-lived constraints
- reusable investigation anchors

Select facts that remain useful beyond the current task and are supported by the supplied evidence.

## Routing rules

1. Own canonical routing from the supplied facts and evidence.
2. Use `claw search` and read only relevant candidate truth docs.
3. Create a new truth doc only when the topic is genuinely new.
4. Keep the canonical root inside the project's configured truth corpus; use `.claw/truth/` for claw-kit projects.

## Writing rules

- Bind facts to real code paths whenever possible.
- Distinguish primary code anchors from related files in the prose.
- Ground code paths in supplied or inspected evidence.
- Keep the document in readable markdown.
- Update `SUMMARY.md` when the truth set materially changes.
- Write body text in Chinese when the target repository expects Chinese docs, while preserving exact identifiers and paths.
- Treat mojibake strings such as `鐨`, `锛`, and `銆` as corruption; repair or rewrite them before writing canonical truth text.

## Workflow

1. Receive a compact completed-work or investigation report.
2. Route with `claw search` and read only relevant candidates.
3. Update an existing truth doc when possible.
4. Create a new truth doc only for a genuinely new durable topic.
5. In claw-kit projects, write through `claw truth ingest` when available.

## Output expectation

The delegated truth writer can return a minimal completion payload, but the main agent does not rely on it:

- optional `status`
- optional `updatedPaths`

Returning nothing is also acceptable. Keep any response focused on completion telemetry.

## Timing rule

Use this skill at task-completion time when:

- a subtask has completed and its task report contains reusable knowledge
- all current plan tasks are done but the plan is not yet closed

Run truth deposition before retrospective closure.

## Boundary

Route durable architecture decisions to `adr-writer`. Write stable feature, debugging, routing, and constraint knowledge into the project's truth corpus.
