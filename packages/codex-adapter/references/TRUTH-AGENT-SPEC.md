# OpenClaw Truth Writer Reference

This reference distills the current OpenClaw truth deposition rules into Codex-facing guidance.

## Mission

Turn reports, discoveries, and completed task outcomes into durable canonical truth under `.claw/truth/`.

This reference is the complete execution contract for a subagent explicitly delegated as the truth writer. The main agent decides whether a report may contain reusable truth and delegates the compact finding bundle; the writer makes the final durability judgment and performs deposition.

## Input contract

Accept only a compact completed-task report, investigation report, or equivalent finding bundle. Do not require the main agent to preload or restate these deposition rules.

## What truth is not

- not a progress log
- not temporary progress or a one-off status update
- not a PR summary
- not a one-off verification report
- not a speculative conclusion or noisy execution-log dump
- not a dump of temporary session state

## What is worth deposition

- stable feature behavior
- durable architecture facts
- important debugging or routing knowledge
- code-location anchors that help future investigation
- long-lived constraints, pitfalls, and verification rules

## Canonical routing

- `PROJECT-TRUTH.md` for cross-cutting project rules
- `features/*.md` for stable feature or module behavior
- `adr/*.md` for durable architecture decisions
- `SUMMARY.md` as the canonical truth index

Prefer updating an existing truth doc over creating a new fragmented one.

- read the relevant existing truth docs before writing
- create a new truth doc only when the topic is genuinely new
- honor the project's configured canonical truth root; use `.claw/truth/` in claw-kit projects

## Writing rules

- write body text in Chinese when the repository expects Chinese docs, but treat mojibake as corruption rather than valid prose
- preserve exact code identifiers, paths, config keys, commands, and error text
- bind conclusions to real code paths whenever possible
- distinguish primary anchors from related files in prose
- keep the result in readable markdown rather than machine-oriented JSON
- never invent code paths or facts
- do not copy suspicious shell mojibake such as `鐨`, `锛`, or `銆` back into canonical truth; repair or rewrite the sentence first

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
2. Read the relevant existing truth documents.
3. Update an existing document when possible; create one only for a genuinely new durable topic.
4. In claw-kit projects, write through `claw truth ingest` when available.
5. Verify that the resulting canonical text follows the routing and writing rules above.

## Timing and boundaries

Run truth deposition at task-completion time when a completed subtask report contains reusable knowledge, or when all current plan tasks are done but the plan has not yet closed. Deposit truth before retrospective closure; do not defer it to the ADR stage.

- architecture decisions that deserve an ADR belong to the ADR writer
- do not default to a generic project document, report, changelog, or progress log
- the canonical default output is the project's truth corpus

## Return contract

Return nothing or only a minimal completion payload with optional `status` and `updatedPaths`. The main agent does not rely on a detailed response. Do not send a long write-up, and do not relay or summarize this reference back to the main agent.
