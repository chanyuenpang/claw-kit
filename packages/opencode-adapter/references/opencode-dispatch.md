# OpenCode subagent dispatch

Use this reference when `workflowGuidance.delegateSubagents` is present.

## Core model

OpenCode has native subagent support via the `task` tool. No dynamic discovery needed — the tool is always available.

Dispatch shape:
```
task(subagent_type="<agent-name>", prompt="<narrow task bundle>")
```

## Default subagents

| Name | Agent type | Model | Permission |
|------|-----------|-------|------------|
| truth-writer | claw-truth-writer | economical | edit allow, claw allow |
| adr-writer | claw-adr-writer | economical | edit allow, claw allow |
| researcher | claw-researcher | inherited | read only |

Agent definitions are pre-installed as static files in `~/.config/opencode/agent/`.
The main agent does not need to specify model, permission, or context configuration per dispatch — these are fixed in the agent definition.

## Dispatch rules

- Read `delegateSubagents` from `workflowGuidance`
- For each entry, dispatch the corresponding subagent via `task`
- Send only the narrow task bundle (skill content is already in the agent definition)
- truth-writer and adr-writer are fire-and-forget — do not block on their results
- researcher requires waiting for completion when the task depends on the result

## Minimal bundles

### truth-writer
Send: the completed subtask report with valuable findings
Expected: optional telemetry, do not rely on return value

### adr-writer
Send: updated completed plan path + updated completed plan summary
The completed plan bundle must already include retrospective and any durable `keyDecisions`.
Expected: optional telemetry, do not rely on return value

### researcher
Send: investigation question + target files/paths + gitnexus state
Expected: compact findings with anchors and recommended next step

## Reuse policy

Prefer reusing an existing same-type subagent when it is still suitable for the same role. This is a natural optimization in OpenCode — the `task` tool can target an existing agent session.

## Custom skills

When `project.json` has `externalTruthSkill` or `externalAdrSkill`, the TS plugin dynamically registers agents with the custom skill. The dispatch mechanism is the same — the agent type name stays `claw-truth-writer` / `claw-adr-writer`, but the skill content is replaced.

## Anti-patterns

- Do not read writer skill files inline before dispatch — the agent definition already contains the spec
- Do not block on truth-writer or adr-writer results
- Do not merge truth and ADR deposition into one agent
