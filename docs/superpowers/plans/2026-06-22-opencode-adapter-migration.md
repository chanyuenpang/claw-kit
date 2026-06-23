﻿﻿﻿# OpenCode Adapter Migration Plan

> Status: DRAFT — under discussion
> Date: 2026-06-22

## Goal

Migrate the claw-kit harness workflow from the Codex plugin to an OpenCode plugin, preserving the workflow kernel while replacing all Codex-specific workarounds with OpenCode-native capabilities.

## Background

### What codex-adapter does

`packages/codex-adapter` is a **pure static asset package** (no `src/`):

- `.codex-plugin/plugin.json` — plugin manifest
- `hooks/hooks.json` — SessionStart hook calling `claw hook SessionStart`
- `skills/` — 7 SKILL.md files (using-claw-kit, planning, researcher, truth-writer, adr-writer, search-workflow, init)
- `references/` — 11 reference documents
- Distributed via `scripts/export-codex-plugin.mjs` / `install-codex-plugin.mjs`

### The three-layer decomposition of codex-adapter

| Layer | What it is | Portability |
|-------|-----------|-------------|
| **Workflow kernel** (~70%) | plan/search/execute/truth/ADR/closeout loop; planning heuristics; truth-writer & adr-writer knowledge specs; search recall model; workflow patterns | Directly reusable |
| **Codex workarounds** (~20%) | `tool_search` discovery; `delegateSubagents` structured contract; repeated "already authorized" declarations; hooks+prompt dual-track; `codex-subagent-dispatch.md` (128 lines) | Entirely removable — OpenCode has native equivalents |
| **Codex-only features** (~10%) | `create_goal`/`update_goal`; `plugin://` URI; `.codex-plugin/plugin.json` manifest; Codex option-style confirmation | Mostly deleted |

## Technical decisions

### Decision 1: CLI platform routing via environment variables (Plan A, Depth 2)

**Problem:** The CLI (`@veewo/claw`) is globally installed and shared across hosts. Currently it has zero platform awareness — all guidance is Codex-shaped.

**Solution:** Introduce `CLAW_HOST` and `CLAW_GUIDANCE_CONFIG` environment variables.

- `CLAW_HOST=opencode` → core routes to OpenCode-specific behavior
- `CLAW_GUIDANCE_CONFIG=<path>` → core loads an external guidance config file
- Absent both → core falls back to bundled config (100% backward-compatible with Codex)

**Core changes (minimal, backward-compatible):**

| File | Change | Est. lines |
|------|--------|-----------|
| `packages/core/src/workflow-guidance.ts` | Add `loadGuidanceConfig()` that checks `CLAW_GUIDANCE_CONFIG` env var; add `host` param to `buildPlanWorkflowGuidance`/`buildDirectWorkflowGuidance`; conditionally suppress `goalTool` when `host !== "codex"` | ~30 |
| `packages/core/src/types.ts` | Make `useCodexOptions` optional; make `model`/`fork_context` in `WorkflowGuidanceSubagent` optional | ~5 |
| `packages/core/src/plan.ts` | Pass `host` through to guidance builder | ~5 |

**Why environment variables instead of file replacement:**

- The same developer may use both Codex and OpenCode simultaneously
- File-level replacement of the bundled config would corrupt the other host's experience
- Environment variables are process-scoped: `shell.env` hook injects them only into OpenCode's child processes

### Decision 2: OpenCode-specific guidance config

A separate `workflow-guidance.opencode.json` is installed alongside the adapter. Key differences from the Codex version:

- **No `goalTool`** — OpenCode has no thread-level goal concept
- **No `goalMode`** — same reason
- **Simplified `delegateSubagents`** — no `fork_context`, no hardcoded `model`, no `preferReuseSameTypeInThread` (agent definitions handle these)
- **Clean `nextsteps`** — no `tool_search`, no `create_goal`, no `/goal` references
- **`askUser` without `useCodexOptions`** — uses plain option style
- **Task progress via `todowrite`** — replaces Codex `Sync the thread progress` with `Use todowrite to sync your tasks list`; see Decision 6

### Decision 3: TS plugin with four injection surfaces

The OpenCode adapter includes a TypeScript plugin (`plugin/index.ts`) that provides:

| Surface | Hook | Purpose | Codex equivalent |
|---------|------|---------|-----------------|
| Environment injection | `shell.env` | Inject `CLAW_HOST=opencode` + `CLAW_GUIDANCE_CONFIG=<path>` into all shell executions | (implicit — Codex runs in its own process) |
| Session start | `event(session.created)` | Detect `.claw/` project, run `claw context` for recovery, store state | `SessionStart` hook -> `claw hook SessionStart` |
| Skill entry trigger | `experimental.chat.system.transform` | Detect `.claw/` in cwd, inject claw-kit workflow guidance into system prompt so agent knows to use claw-kit | `SessionStart` hook's `additionalContext` with recovery context |
| Goal continuation | `event(session.idle)` + `client.session.promptAsync()` | Auto-advance agent when plan.status is process.active | Codex native goal mode (`create_goal`/`update_goal`) |
| **(Optional fallback)** | `tool.execute.after` | If guidance alone is insufficient, append stronger prompts to CLI output | (unused on Codex) |

### Decision 4: Static agent files for default subagents + dynamic registration for custom skills

**Default subagents** (truth-writer, adr-writer, researcher):
- Installed as static agent files in `~/.config/opencode/agent/`
- Each has fixed model, permission, and role skeleton
- Installed by the install script, not by the TS plugin

**Custom skills** (via `project.json` -> `externalTruthSkill` / `externalAdrSkill`):
- Dynamically registered by the TS plugin at startup
- Plugin reads `project.json` and registers agents with the custom skill injected

### Decision 5: Plugin-driven goal continuation (prompt-based gate)

OpenCode has no native thread-level goal concept. Instead, the TS plugin implements goal continuation using **plan.status as the sole trigger signal**.

**Core principle:** `plan.status === process.active` IS the goal state. The plugin drives continuation; the agent is unaware of the mechanism.

**Trigger:**

- `event(session.idle)` fires when the agent has fully stopped producing output
- Plugin reads `plan.json` -> if `status === "process.active"`, send continuation prompt
- When `status !== "process.active"` (prepare/wait/discussing/end), do nothing
- No permission tracking needed: `session.idle` only fires after agent fully stops; opencode's own permission system handles tool approval before idle fires

**Gate is prompt-based, not programmatic:**

We cannot reliably detect "did the agent actually make progress" via code. The agent might have changed files without updating task status, run commands that failed, or done research without output. Only the LLM itself can judge whether progress was made.

Therefore the continuation prompt carries the stall rule directly:

```
当前plan还未执行完毕，需要继续推进。如果连续两轮都没有推进成功，那么把 plan.status 设置为wait
```

The agent reads this prompt, evaluates its own progress, and either continues working or sets the plan to `process.wait` by itself. The plugin does not attempt to second-guess the agent.

**Continuation flow:**

```
1. Agent runs `claw plan edit --plan-status process.active`
2. Agent executes task, naturally stops -> session.idle fires
3. Plugin: resolve session's bound plan -> status === process.active? -> yes
4. Plugin: send continuation prompt via client.session.promptAsync()
5. Agent reads prompt -> continues working OR sets plan to process.wait
6. If agent continues -> session.idle fires again -> repeat from step 3
7. If agent sets process.wait -> plugin reads status -> not process.active -> stops
8. If agent runs `claw plan done` -> status becomes end.completed -> plugin stops
```

**Why no `claw goal start/stop` commands:**

The original idea was to add CLI commands for goal lifecycle. But `plan.status === process.active` already serves as the signal. Adding a separate goal state would be redundant:

- goal start == `claw plan edit --plan-status process.active`
- goal stop == `claw plan edit --plan-status process.wait` (or `claw plan done`)
- goal status == read `plan.json` status field

No new CLI commands needed. No new state file. No schema change to plan.json.

**Session-to-plan binding:**

The plugin maintains a `sessionID -> planState` map. This binding is established when `session.created` runs `claw context` recovery and detects an active plan. If no plan is bound to a session, goal continuation does nothing. This is the only state the plugin needs to track.

**Codex compatibility:**

On Codex, the existing `goalTool`/`goalMode` fields in guidance continue to work as before (returned by bundled config, consumed by Codex native goal mode). The OpenCode plugin's continuation mechanism is entirely host-side and invisible to the CLI.

### Decision 6: Task progress sync via opencode todo

**Problem:** Codex guidance has 8 instances of "Sync the thread progress with our tasks" and "Clear thread progress". This maps the plan task states to Codex's thread-level progress UI. OpenCode has no "thread progress" concept, but has a native `todowrite` tool with a TUI-visible todo list.

**OpenCode todo type (verified from SDK):**

``typescript
export type Todo = {
    content: string;    // task description
    status: string;     // pending | in_progress | completed | cancelled
    priority: string;   // high | medium | low
    id: string;
};
``

**Mapping:**

| Codex guidance text | OpenCode guidance text |
|---|---|
| `Sync the thread progress with our tasks.` | `Use todowrite to sync your tasks list.` |
| `Clear thread progress.` | `Clear your tasks list with todowrite.` |

**Plan task -> Todo mapping:**

| Plan task field | Todo field |
|---|---|
| `task.id` + `task.title` | `content` (e.g. "task #3: Implement XXX") |
| `task.status === "pending"` | `status: "pending"` |
| `task.status === "in_progress"` | `status: "in_progress"` |
| `task.status === "done"` | `status: "completed"` |
| (inferred from plan importance) | `priority` |

**This is guidance text only — no plugin code needed.** The agent reads the guidance, calls `todowrite` itself. The plugin does not programmatically sync todos.

**Why not sync programmatically in the plugin:**

- `todowrite` is an agent tool, not a plugin API. The plugin cannot directly write todos — only the agent can via tool calls.
- Guidance text telling the agent to sync is sufficient and matches the Codex approach (Codex also relies on guidance text, not programmatic sync).
- The `todo.updated` event exists for reading, but there is no SDK method to write todos from plugin code.

### Decision 7: Installation layout

`
~/.config/opencode/
+-- plugins/
|   +-- claw-kit/                    # Plugin package directory
|       +-- index.ts                 # TS plugin entry (auto-discovered)
|       +-- skills/                  # 7 SKILL.md files
|       +-- references/              # Reference docs
|       +-- workflow-guidance.opencode.json
|       +-- package.json             # Plugin deps (@opencode-ai/plugin, @opencode-ai/sdk)
+-- agent/
|   +-- claw-truth-writer.md         # Static agent definitions (copied by install script)
|   +-- claw-adr-writer.md
|   +-- claw-researcher.md
`

- TS plugin lives in `plugins/claw-kit/` — opencode auto-discovers `*.ts` files under `plugins/`
- Plugin registers `skills.paths` via `config(cfg)` hook, pointing to its own bundled `skills/` directory
- Agent definitions are copied to the standard `agent/` directory by the install script
- **User's `opencode.json` is not modified** — plugin self-registers everything via hooks
- `workflow-guidance.opencode.json` stays inside the plugin directory; `shell.env` resolves its path relative to the plugin location

### Decision 8: Skill entry trigger via .claw/ detection

**Problem:** How does the agent know to use claw-kit when the user just says "fix this bug"?

**Solution:** Same as Codex — session start detection. When `session.created` fires and cwd contains `.claw/`, the plugin injects claw-kit workflow guidance into the system prompt via `experimental.chat.system.transform`.

This is the exact equivalent of Codex's `SessionStart` hook injecting `additionalContext`. The agent sees the guidance in system context and naturally follows the claw-kit workflow.

No `AGENTS.md` required. No user configuration. Fully automatic.

**Question tool edge case:** When agent stops after calling `question`, the plugin will send a continuation prompt. This is acceptable — the agent reads the continuation prompt, realizes it is waiting for a user answer, and waits. The continuation prompt does not force the agent to ignore the user. opencode's own permission system handles tool approval separately.

## Architecture overview

```
+---------------------------------------------------------------+
|  packages/core (minimal backward-compatible changes)           |
|  - CLAW_GUIDANCE_CONFIG env var support (~20 lines)            |
|  - CLAW_HOST param for conditional goalTool/goalMode (~15 lines)|
|  - Type generalization (~5 lines)                              |
|  - Codex path: 100% unchanged                                  |
+---------------------------------------------------------------+
|  packages/opencode-adapter (new)                               |
|  +-- plugin/index.ts          # TS plugin: 4 injection surfaces|
|  +-- skills/                  # 7 SKILL.md (slimmed from Codex)|
|  |   +-- using-claw-kit/      # Main entry                    |
|  |   +-- planning/            # Planning heuristics            |
|  |   +-- researcher/          # Investigation delegation       |
|  |   +-- truth-writer/        # Truth deposition guidance      |
|  |   +-- adr-writer/          # ADR deposition guidance        |
|  |   +-- search-workflow/     # Recall search                  |
|  |   +-- init/                # Project initialization         |
|  +-- agents/                  # 3 static subagent definitions  |
|  |   +-- claw-truth-writer.md                                 |
|  |   +-- claw-adr-writer.md                                   |
|  |   +-- claw-researcher.md                                   |
|  +-- references/              # Slimmed reference docs         |
|  |   +-- TRUTH-AGENT-SPEC.md  # Reuse from codex-adapter       |
|  |   +-- ADR-AGENT-SPEC.md    # Reuse from codex-adapter       |
|  |   +-- opencode-dispatch.md # New, replaces 128-line codex   |
|  |                            #   subagent-dispatch doc        |
|  +-- workflow-guidance.opencode.json  # OpenCode-specific cfg  |
|  +-- package.json                                             |
|  +-- tsconfig.json                                            |
+---------------------------------------------------------------+
|  scripts/ (new)                                                |
|  +-- opencode-plugin-bundle.mjs                                |
|  +-- export-opencode-plugin.mjs                                |
|  +-- install-opencode-plugin.mjs                               |
|  +-- install-opencode-plugin.ps1                               |
+---------------------------------------------------------------+
|  package.json (root, new scripts)                              |
|  export:opencode-plugin                                        |
|  install:opencode-plugin                                       |
+---------------------------------------------------------------+
```

## Injection surface detail

### (1) shell.env

```typescript
"shell.env": async (input, output) => {
  output.env.CLAW_HOST = "opencode";
  output.env.CLAW_GUIDANCE_CONFIG = path.join(adapterDir, "workflow-guidance.opencode.json");
}
```

Every `claw plan create` / `claw plan edit` / `claw plan done` call by the agent's bash tool automatically carries these environment variables. The CLI routes to OpenCode-specific guidance without any adapter-side text compensation.

### (2) event(session.created)

```typescript
event: async ({ event }) => {
  if (event.type !== "session.created") return;
  // Detect .claw/ project
  const clawExists = await pathExists(path.join(cwd, ".claw"));
  if (!clawExists) return;
  // Run claw context for recovery (with CLAW_HOST injected)
  const result = await $claw context.env({ CLAW_HOST: "opencode", CLAW_GUIDANCE_CONFIG }).text();
  // Run claw plan to recover active workflow snapshot
  const snapshot = await $claw plan.env({ CLAW_HOST: "opencode", CLAW_GUIDANCE_CONFIG }).text();
  // Cache recovered state for system.transform
  recoveredState = parseRecovery(result, snapshot);
}
```

Replaces Codex's `SessionStart` hook. Runs the same recovery logic (`claw context` + active plan snapshot) that the Codex hook does.

### (3) experimental.chat.system.transform

```typescript
"experimental.chat.system.transform": async (input, output) => {
  if (!recoveredState) return;
  // Inject claw-kit workflow guidance so agent knows to use claw-kit skills
  // This replaces both: Codex additionalContext injection AND skill entry trigger
  output.system.push(formatClawStartupContext(recoveredState));
}
```

Injects the recovered project state into the system prompt. Replaces Codex hook's `additionalContext` injection.

### (4) Goal continuation (event(session.idle) + promptAsync)

```typescript
event: async ({ event }) => {
  if (event.type === "session.idle") {
    await handleGoalContinuation(event.properties.sessionID);
  }
}

async function handleGoalContinuation(sessionID: string) {
  // 1. Resolve session's bound plan
  const planState = getPlanForSession(sessionID);
  if (!planState) return;  // no plan bound to this session

  // 2. Check plan status
  if (planState.status !== "process.active") return;

  // 3. Send continuation prompt
  // No permission tracking: session.idle only fires after agent fully stops
  await client.session.promptAsync({
    body: {
      sessionID,
      message: {
        role: "user",
        content: [{ type: "text",
          text: "当前plan还未执行完毕，需要继续推进。如果连续两轮都没有推进成功，那么把 plan.status 设置为wait"
        }]
      }
    }
  });
}
```

The agent reads this prompt and either continues executing or sets the plan to `process.wait`. No programmatic stall detection — the agent judges its own progress.

### (5) (Optional fallback) tool.execute.after

If guidance alone proves insufficient:

```typescript
"tool.execute.after": async (input, output) => {
  if (isClawCommand(input)) {
    const guidance = parseGuidance(output.output);
    output.output += formatNextActionPrompt(guidance);
  }
}
```

Note: `client.session.promptAsync()` is the primary force-advance path. `tool.execute.after` output modification is secondary. Both are available if needed.

## OpenCode plugin capabilities (verified from SDK v1.1.51)

| Capability | Hook/API | Status |
|-----------|----------|--------|
| Inject env vars into shell | `shell.env` | Stable |
| Session start detection | `event(session.created)` | Stable |
| Session idle detection | `event(session.idle)` | Stable |
| System prompt injection | `experimental.chat.system.transform` | Experimental |
| Modify tool output | `tool.execute.after` | Stable |
| Modify tool args before exec | `tool.execute.before` | Stable |
| Register custom tools | `tool: { [name]: ToolDefinition }` | Stable |
| Register agents | `config(cfg)` - mutate `cfg.agent` | Stable |
| Register skills paths | `config(cfg)` - mutate `cfg.skills` | Stable |
| SDK: send message | `client.session.promptAsync()` | Stable |
| SDK: append TUI prompt | `client.tui.appendPrompt()` | Stable |
| SDK: list messages | `client.session.messages()` | Stable |

### session.idle semantics (verified from types.gen.d.ts)

```typescript
export type SessionStatus = {
    type: "idle";
} | {
    type: "retry";
    attempt: number;
    message: string;
    next: number;
} | {
    type: "busy";
};

export type EventSessionIdle = {
    type: "session.idle";
    properties: {
        sessionID: string;
    };
};
```

`session.idle` fires when the agent has fully stopped producing output. `session.status` events provide `busy` / `idle` / `retry` states. This is the reliable "agent stopped" signal that goal continuation depends on.

## Codex vs OpenCode: what changes for the agent

| Aspect | Codex | OpenCode |
|--------|-------|---------|
| Plugin invocation | `@claw-kit` / `plugin://` URI | Skill auto-trigger by description, or `skill` tool |
| Subagent dispatch | `tool_search` -> dynamic agent-management tools | `task(subagent_type="claw-truth-writer")` - native, stable |
| Subagent config | Per-dispatch contract (`fork_context`, `agent_type`, `model`) | Agent definition file (model/permission/mode fixed upfront) |
| Goal tracking | `create_goal` / `update_goal(status)` | Plugin-driven: `session.idle` + `promptAsync` (agent unaware) |
| Goal stall handling | Codex native (not our concern) | Prompt-based: agent self-judges, sets `process.wait` if stuck |
| Option confirmation | Codex option-style (`useCodexOptions: true`) | Plain `question` tool or freeform |
| Session startup | `SessionStart` hook -> `additionalContext` | `event(session.created)` + `system.transform` |
| Tool discovery | `tool_search` (dynamic, unreliable) | Tools are statically available |
| Task progress UI | Thread progress (`Sync the thread progress`) | `todowrite` tool — native tasks list with pending/in_progress/completed/cancelled states |

## Execution phases

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Core: add `CLAW_HOST` + `CLAW_GUIDANCE_CONFIG` support | Pending |
| 1 | Create opencode-adapter skeleton | Done |
| 2 | Write `workflow-guidance.opencode.json` | Pending |
| 3 | Write 7 SKILL.md files | Pending |
| 4 | Write 3 static subagent agent definitions | Pending |
| 5 | Write TS plugin `plugin/index.ts` (5 surfaces) | Pending |
| 6 | Write reference documents | Pending |
| 7 | Write distribution scripts | Pending |
| 8 | Build verification | Pending |

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| `experimental.chat.system.transform` may change/break | Plugin degrades gracefully: session start recovery still runs, just not injected into system prompt. Agent can run `claw context` manually. |
| Goal continuation causes infinite loop | Prompt-based stall rule: agent self-judges progress and sets `process.wait` after 2 stalled rounds. opencode's own permission system prevents idle during tool approval. |
| `client.session.promptAsync()` timing | `session.idle` only fires after agent fully stops, so promptAsync at that point should be safe. Permission gate adds extra safety. |
| Shared global CLI corruption | Environment variables are process-scoped; Codex process never sees `CLAW_HOST=opencode` |
| Guidance config schema drift | Both configs share the same `GuidanceConfig` type; OpenCode version is a strict subset (no goalTool/goalMode) |
