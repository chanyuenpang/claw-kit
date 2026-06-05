# claw-kit `project.json` And `task meta.json` Schema Draft

## Purpose

Define the first compatibility-first schema draft for:

- `.claw/project.json`
- `.claw/tasks/{taskName}/meta.json`

This draft stays close to current OpenClaw behavior and current `.claw` projects.

Two constraints guide it:

1. existing `.claw` projects should continue to work with minimal or no migration
2. the extracted `claw-kit` must later plug back into OpenClaw as an adapter/plugin, not fork the semantics

## Key Framing

The useful host split is not "has session id" versus "has no session id".

The more useful split is:

- hosts like OpenClaw may reuse a small number of sessions across many tasks
- hosts like Codex and OpenCode may naturally let one session stay bound to one task

That means:

- session identity is common enough to preserve in the protocol when useful
- explicit `switch-task` is important for OpenClaw-style hosts
- explicit `switch-task` is optional for hosts that are comfortable with strong session-task binding
- for Codex and OpenCode, `new session => new task` is a reasonable default product behavior
- archive policy is intentionally deferred for now because the immediate goal is letting Codex take over existing `.claw/` projects with minimal semantic drift

## Source Evidence

This draft is based mainly on:

- `OpenClaw-dev/src/agents/project-context.ts`
- `OpenClaw-dev/src/agents/tools/task-tool.ts`
- `OpenClaw-dev/src/agents/tools/project-tool.ts`
- `OpenClaw-dev/src/agents/tools/task-history-tool.ts`

Relevant current OpenClaw types:

- `ClawProjectDeclaration`
- `TaskMeta`
- `LeaveState`
- `InheritedFrom`
- `PreviousTaskRef`
- `TaskTakeover`

## `.claw/project.json`

### Role

`project.json` should be the portable project declaration file for `claw-kit`.

It should describe:

- project identity
- project-scoped context declarations
- project-scoped memory, truth, and index preferences
- optional agent/bootstrap declarations that adapters can consume

It should not store:

- ephemeral host registration state
- last-session bindings
- index freshness timestamps
- adapter-private caches

### Recommended Canonical Shape

```json
{
  "id": "claw-kit",
  "name": "claw-kit",
  "contextPaths": ["docs/overview.md"],
  "memory": {
    "externalDocPaths": ["docs/reference/api.md"]
  },
  "gitnexus": {
    "enabled": true
  },
  "truth": {
    "enabled": true,
    "autoAdr": true,
    "adrThreshold": "high",
    "excludedAgents": [],
    "maxReportAge": 86400
  },
  "agent": {
    "files": ["agent.md"],
    "skills": ["skills/"],
    "commands": ["commands/"],
    "mcpServers": {}
  }
}
```

### Field Notes

#### `id`

Recommended addition for `claw-kit`, even though current `ClawProjectDeclaration` does not carry it directly.

Reason:

- portable CLI commands should not rely on state-dir registration to recover project identity
- existing projects without `id` can derive it from repo name or adapter registration during compatibility load

Compatibility rule:

- if `id` is absent, adapters may derive it
- if `id` is present, treat it as authoritative

#### `name`

Keep as the display name and compatibility anchor from `ClawProjectDeclaration.name`.

#### `contextPaths`

Keep as-is.

This is already portable and meaningful outside OpenClaw.

#### `memory.externalDocPaths`

Keep as-is.

This belongs in the portable declaration because it changes what project memory search should include.

#### `gitnexus.enabled`

Keep as a user declaration.

Do not carry over runtime registration state such as:

- `repoId`
- `indexed`
- `lastIndexed`

Those are adapter/runtime state, not canonical project truth.

#### `truth`

Recommended as the normalized portable truth declaration block.

Keep the parts that still matter cross-host:

- `enabled`
- `autoAdr`
- `adrThreshold`
- `excludedAgents`
- `maxReportAge`

Do not keep legacy visibility or mode fields as target protocol concepts.

For `claw-kit`, the assumption is simple:

- canonical truth lives under `.claw/truth/`

So older OpenClaw declaration ideas such as these should be treated as compatibility-read concerns only:

- `visibility`
- `truthVisible`
- `mode`

#### `agent`

Keep the declaration-level bootstrap surface:

- `files`
- `skills`
- `commands`
- `mcpServers`

This is useful across hosts because it expresses project-local harness bootstrap intent without requiring one specific runtime.

### Fields That Should Not Be Canonical In `project.json`

Do not store these in `project.json`:

- `sessionLastTasks`
- `memoryStore.path`
- `gitnexus.repoId`
- `gitnexus.indexed`
- `gitnexus.lastIndexed`
- any agent-context restore record
- any active task pointer

These are host-managed operational state.

## `.claw/tasks/{taskName}/meta.json`

### Role

`meta.json` should be the canonical task state file.

It should answer:

- what this task is
- when it was created and updated
- which plan is currently active
- what lineage and handoff information exists
- whether the host wants to record a current session binding

### Recommended Canonical Shape

```json
{
  "name": "extract-harness-core",
  "description": "Extract harness semantics from OpenClaw into claw-kit",
  "projectId": "claw-kit",
  "createdAt": "2026-06-06T09:00:00.000Z",
  "updatedAt": "2026-06-06T10:00:00.000Z",
  "subagents": [],
  "status": "active",
  "taskType": "implementation",
  "activePlan": "plan.json",
  "rules": [
    "preserve .claw compatibility"
  ],
  "ownerSessionKey": "session-or-thread-id",
  "ownerRootAgentId": "optional-root-agent-id",
  "boundAt": "2026-06-06T10:00:00.000Z",
  "leaveState": {
    "leftAt": "2026-06-06T10:10:00.000Z",
    "reason": "user_switch",
    "nextTask": "compare-gitnexus-indexing",
    "continueNeeded": true
  },
  "prevTask": "compare-gitnexus-indexing",
  "previousTask": {
    "projectId": "claw-kit",
    "task": "compare-gitnexus-indexing",
    "linkedAt": "2026-06-06T10:12:00.000Z",
    "reason": "user_switch",
    "leaveStateAt": "2026-06-06T10:10:00.000Z"
  },
  "inheritedFrom": {
    "projectId": "claw-kit",
    "task": "compare-gitnexus-indexing",
    "mode": "prev_task",
    "linkedAt": "2026-06-06T10:12:00.000Z",
    "historyLimit": 5,
    "reason": "user_switch",
    "sourceStatus": "active",
    "sourceUpdatedAt": "2026-06-06T10:10:00.000Z",
    "sourceLeaveStateUpdatedAt": "2026-06-06T10:10:00.000Z",
    "sourceLeaveState": {
      "leftAt": "2026-06-06T10:10:00.000Z",
      "reason": "user_switch"
    }
  }
}
```

### Field Classification

#### Identity and lifecycle

Keep as canonical:

- `name`
- `description`
- `projectId`
- `createdAt`
- `updatedAt`
- `status`
- `taskType`

#### `subagents`

Keep for now as canonical history.

Reason:

- existing projects already carry it
- it is useful execution evidence
- task history and handoff logic already read it

#### `activePlan`

Keep exactly as-is.

This is a key compatibility anchor.

#### `rules`

Keep as canonical, but treat as a mirror or snapshot of active plan context.

#### `ownerSessionKey`

Keep as optional canonical.

Reason:

- session identity is widely available
- OpenClaw-style hosts need it for guard ownership and takeover logic
- Codex/OpenCode-style hosts may still record it cheaply

But it should not be required for every host workflow.

If a host naturally binds one session to one task and rarely switches, it may write this once and almost never update it.

#### `ownerRootAgentId`

Keep as optional canonical.

Useful when a host has a meaningful root-agent concept, but it should not be mandatory.

#### `boundAt`

Keep as optional canonical.

Useful whenever a host records task/session binding.

### Leave and handoff lineage

Keep as canonical:

- `leaveState`
- `prevTask`
- `previousTask`
- `inheritedFrom`

Reason:

- these are not just runtime traces
- they express task-to-task continuity and handoff semantics
- current task history fallback already depends on them

### Fields That Should Be Compatibility-Preserved But Not Required

#### `takeover`

Do not make this required across hosts.

Recommendation:

- preserve and read it for compatibility
- allow OpenClaw to keep writing it
- do not require Codex/OpenCode adapters to implement it in MVP

#### `lastTakeover`

Same recommendation as `takeover`.

#### `takeoverSeq`

Treat as adapter/runtime bookkeeping, not required canonical task truth.

## Host Interpretation

### OpenClaw

OpenClaw is the main consumer of:

- `ownerSessionKey`
- `ownerRootAgentId`
- `boundAt`
- `takeover`
- `lastTakeover`
- `takeoverSeq`
- explicit `switch-task`

because its core workflow reuses sessions across tasks and needs plan guard to target only one live owner session.

### Codex / OpenCode

Codex and OpenCode can accept a simpler default:

- a session is strongly bound to one task
- a new task can simply mean a new session
- explicit `switch-task` is optional and more like advanced usage for revisiting an older task

For these hosts, `meta.json` should still preserve compatibility, but the common path can be much simpler.

## Compatibility Rules

`claw-kit` loaders should accept:

- missing `project.json.id`
- missing `ownerSessionKey`
- missing `ownerRootAgentId`
- missing `boundAt`
- missing lineage fields on older tasks
- presence of legacy OpenClaw truth declaration fields, even if they are normalized away on write

For the first extraction pass:

- prefer not to rewrite unrelated legacy fields away automatically
- normalize only when the user or adapter explicitly mutates the file

## Open Questions

1. Should `subagents/` directory artifacts and `meta.subagents` both remain canonical, or should one become derived later?
2. Should `rules` remain mirrored in `meta.json`, or should future adapters always source them from the active plan?
3. In hosts that never switch tasks inside one session, should `ownerSessionKey` still be written consistently, or only when guard or takeover features are enabled?
4. Should takeover history eventually move under `.claw/runtime/host/`, while `ownerSessionKey` stays in canonical task metadata?

## Current Recommendation

For the next step, assume:

- `project.json` is a portable declaration file
- `meta.json` is a canonical task state file
- `activePlan`, lineage, and leave-state semantics should stay very close to current OpenClaw
- session binding fields are optional but valid canonical fields
- explicit `switch-task` is host-conditional rather than universally mandatory
- for Codex and OpenCode, `new session => new task` is the default recommended model
- takeover bookkeeping is compatibility-kept, but not required for every host MVP
- archive semantics are deferred until after Codex can operate cleanly on existing `.claw/` projects
