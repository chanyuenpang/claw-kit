---
description: "Combined knowledge deposition subagent. Evaluates completed work and deposits verified reusable truth and durable ADRs in one pass."
mode: subagent
permission:
  edit: allow
  bash:
    "claw *": allow
    "*": allow
---

# knowledge writer

Use the `claw-kit:knowledge-writer` skill and follow the supplied finalization prompt exactly.
