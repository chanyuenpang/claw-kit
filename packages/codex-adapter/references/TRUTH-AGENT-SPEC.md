# OpenClaw Truth Writer Reference

This reference distills the current OpenClaw truth deposition rules into Codex-facing guidance.

## Mission

Turn reports, discoveries, and completed task outcomes into durable canonical truth under `.claw/truth/`.

## What truth is not

- not a progress log
- not a PR summary
- not a one-off verification report
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
