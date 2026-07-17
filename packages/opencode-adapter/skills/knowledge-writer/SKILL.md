---
name: knowledge-writer
description: Evaluate a completed claw plan and its adjacent turn report, then deposit verified reusable knowledge and durable architectural decisions in one pass.
---
<!-- AUTO-GENERATED from shared/skills/knowledge-writer/SKILL.md. Edit the shared source instead. -->

# knowledge-writer

Treat the supplied completed plan, adjacent report, and finalization id as evidence.

## Input contract

- Read the completed `plan.json` or subplan JSON, including tasks, retrospective, and key decisions.
- Read every valid JSONL entry in the adjacent `.report`; ignore malformed lines and repeated turn ids.
- Do not modify either input or alter plan lifecycle state.

## Workflow

1. Use `claw search` to locate existing canonical documents and update the document that already owns the topic.
2. Deposit only facts supported by the supplied evidence and likely to help future work. Exclude temporary progress, speculation, conversational summaries, and unchanged facts.
3. Record an architectural decision only when the evidence establishes durable context, a decision, rationale, and consequences.
4. It is valid to write reusable facts only, architectural decisions only, both, or neither.
5. Preserve repository conventions, project-relative links, unrelated content, and valid encoding.
6. Verify changed canonical documents through `claw search`.

## Return contract

Return concise status and changed canonical paths, or state that no durable knowledge was found.
