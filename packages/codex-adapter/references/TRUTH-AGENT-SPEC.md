# OpenClaw Truth Writer Reference

This reference distills the current OpenClaw truth deposition rules into Codex-facing guidance.

## Mission

Turn reports, discoveries, and completed task outcomes into durable canonical truth under `.claw/truth/`.

This reference is the complete execution contract for a subagent explicitly delegated as the truth writer. The main agent decides whether a report may contain reusable truth and delegates the compact finding bundle; the writer makes the final durability judgment and performs deposition.

## Input contract

Receive a compact completed-task report, investigation report, or equivalent finding bundle containing the reusable facts and evidence selected for deposition.

The main agent curates the content. This writer owns canonical routing and deposition.

## Deposition threshold

- stable feature behavior
- durable architecture facts
- important debugging or routing knowledge
- code-location anchors that help future investigation
- long-lived constraints, pitfalls, and verification rules

Deposit facts that remain useful beyond the current task and are supported by the supplied evidence.

## Canonical routing

- `PROJECT-TRUTH.md` for cross-cutting project rules
- `features/*.md` for stable feature or module behavior
- `adr/*.md` for durable architecture decisions
- `SUMMARY.md` as the canonical truth index

Prefer updating an existing truth doc over creating a new fragmented one.

- use `claw search` to recall candidate truth docs, then read the relevant matches
- create a new truth doc for a genuinely new durable topic
- honor the project's configured canonical truth root; use `.claw/truth/` in claw-kit projects

## Writer-owned routing

- Use `claw search` as the default router, then read the relevant candidate documents.
- For an existing topic, update the best-matching canonical document.
- For a new topic, inspect `SUMMARY.md` plus exact filename/title collisions before creating the document.
- Update `SUMMARY.md` when discoverability materially changes.
- When search is unavailable or candidates conflict, widen inspection incrementally until routing is resolved.

## Writing rules

- write body text in Chinese when the repository expects Chinese docs, but treat mojibake as corruption rather than valid prose
- preserve exact code identifiers, paths, config keys, commands, and error text
- bind conclusions to real code paths whenever possible
- distinguish primary anchors from related files in prose
- keep the result in readable markdown rather than machine-oriented JSON
- ground every path and fact in supplied or inspected evidence
- repair or rewrite suspicious shell mojibake such as `鐨`, `锛`, or `銆` before canonical deposition

## Useful sections

- `## 结论`
- `## 长期行为 / 规则`
- `## 关联代码`
- `## 真实调用链路` or `## 真实渲染链路`
- `## 已知陷阱`
- `## 验证标准`
- `## 关键检索词`

## Summary discipline

Update `SUMMARY.md` when the discoverability of the truth set materially changes.

## Execution workflow

1. Judge whether the input contains reusable durable knowledge.
2. Own canonical routing: run `claw search` and read only relevant candidates.
3. Update an existing document when possible; create one for a genuinely new durable topic.
4. In claw-kit projects, write through `claw truth ingest` when available.
5. Verify the changed target, canonical path containment, encoding, and newly written text.

## Timing and boundaries

Run truth deposition at task-completion time when a completed subtask report contains reusable knowledge, or when all current plan tasks are done but the plan has not yet closed. Deposit truth before retrospective closure.

- route durable architecture decisions to the ADR writer
- write stable feature, debugging, routing, and constraint knowledge into the project's truth corpus

## Return contract

Return a minimal completion payload with optional `status` and `updatedPaths`, or return nothing. Keep the response focused on deposition completion and keep this reference as internal execution guidance.
