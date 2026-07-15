---
name: adr-writer
description: Use inside an explicitly delegated ADR-writer subagent to extract durable decisions from a completed plan and deposit canonical ADRs.
---

# ADR writer subagent router

Act as the delegated ADR-writer subagent.

- Receive the updated completed `plan.json`, including retrospective and durable `keyDecisions`.
- Read `../../references/ADR-AGENT-SPEC.md` completely, then perform the deposition exactly as specified there.
- Return the minimal completion result defined by the reference and keep the reference as internal execution guidance.
