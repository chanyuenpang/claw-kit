---
name: using-claw-kit
description: "Use first whenever the claw-kit Cindy plugin is enabled or its start prompt is present; check your available tools and follow the matching execution route."
---

# Using claw-kit in Cindy

Use this skill first whenever the claw-kit Cindy plugin is enabled or the Cindy
start prompt identifies a claw-kit workflow.

The session start prompt tells you which tools to use for claw workflow
operations. Follow the matching path below; do not mix routes.

## Route detection

- **If the start prompt says to use `shell_command` and a code-mode bridge:**
  Go to [Shell + bridge path](#shell--bridge-path--gpt-models).
- **If the start prompt says to use Ghost tools (`list_tools` / `call_tool`):**
  Go to [Ghost tool path](#ghost-tool-path--default).

---

## Shell + bridge path (GPT models)

### Canonical state

- The `.claw/` project, task, and plan files are the source of truth.
- Run `claw` CLI commands through `shell_command`; never use Ghost tools for workflow operations.
- Plan mutations use the code-mode bridge below.

### Session entry

1. Read the workflow snapshot injected by the Cindy Host at session start.
2. If the Host reports that claw is unavailable, surface its diagnosis and continue.
3. When an active session-bound plan is recovered, continue that plan before starting unrelated work.

### Planning and execution

- Follow the returned `workflowGuidance` as the only lifecycle contract. Use its stage and
  current task to determine the current work; `commandHints` are command lookup aids.
- A plan is the task container, not a frozen script: adapt requirements, scope, and tasks
  to new user needs.
- `process.discussing`: clarify requirements and do not implement prematurely.
- `process.active`: execute one plan task at a time and keep plan state current.
- `process.wait`: stop until the user or dependency resumes the workflow.
- `end.*`: perform the required closeout and do not auto-continue.
- For a complex sub-task, prefer `claw subplan create` to hand it off.

### Code-mode bridge for plan mutations

For every claw plan mutation, run this function in code mode. Change only `command`, `workdir`,
and `timeout_ms`:

```javascript
async function runClawPlanMutation({ command, workdir, timeout_ms = 30000 }) {
  const cacheKey = "claw-kit:codex-driver:v9:s1";
  let envelope = load(cacheKey);
  if (!envelope) {
    const raw = typeof tools.shell_command === "function" ? await tools.shell_command({ command: "claw codex driver", workdir, timeout_ms })
      : typeof tools.exec_command === "function" ? await tools.exec_command({ cmd: "claw codex driver", workdir, yield_time_ms: timeout_ms })
      : (() => { throw new Error("No supported command-execution tool"); })();
    const output = typeof raw === "string" ? raw : (raw.output ?? raw.stdout ?? raw.text ?? "");
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}") + 1;
    if (start < 0 || end <= start) throw new Error("claw returned no driver envelope");
    envelope = JSON.parse(output.slice(start, end));
    if (envelope?.cacheKey !== cacheKey || envelope?.driverVersion !== 9 || envelope?.hostActionSchemaVersion !== 1) {
      throw new Error("incompatible claw driver envelope");
    }
    store(cacheKey, envelope);
  }
  const runner = (0, eval)(`(${envelope.source})`);
  if (typeof runner !== "function") throw new Error("invalid claw driver source");
  return runner({ command, workdir, timeout_ms }, { tools, text });
}
```

### Hard boundaries

- Strongly prefer running plan mutations through the code-mode bridge.
- Edit canonical plan state only through claw commands supplied by returned guidance.
- If code mode or the driver is unavailable, stop with the program error; no direct-call fallback.
- Keep claw harness mechanics out of normal thread replies.

### Completion

When all plan tasks are complete:

1. Complete the canonical plan transition through the bridge.
2. Report the completed work to the user. The Host captures that final report
   and then queues any required knowledge closeout.

---

## Ghost tool path (default)

### Canonical state

- The `.claw/` project, task, and plan files are the source of truth.
- Cindy Progress/Todo and Goal are Host-owned optional presentation surfaces;
  never treat them as a second plan database or attempt to operate them.
- The Ghost Node Worker owns `claw` discovery, `--host cindy`, session binding,
  command execution, and lifecycle projection. Do not run `claw` shell
  commands, supply host/session arguments, or request a plan sync.

### Session entry

1. Read the workflow snapshot injected by the Cindy Host at session start (or
   after Host-managed compact recovery).
2. If the Host reports that claw is unavailable, surface its actionable
   diagnosis and continue without pretending that recovery succeeded.
3. When an active session-bound plan is recovered, continue that plan before
   starting unrelated work.

Only the Host invokes `claw context`, and only for session start or compact
recovery. It is never a turn-end status probe.

### Planning and execution

- The first tool action is always the Ghost `list_tools` operation. Do not use
  MCP resource discovery or search for a server name.
- Use `list_tools` to discover the typed workflow operations and `call_tool`
  to invoke them. Use operation names and JSON arguments, not shell strings.
- Follow the returned Cindy `guidance` object. Its `commandHints` are
  equivalent `call_tool` instructions: invoke the given operation name and
  JSON arguments, and fill any listed `requiredArgs` before calling.
- `process.discussing`: clarify requirements and do not implement prematurely.
- `process.active`: execute one plan task at a time and keep plan state current.
- `process.wait`: stop until the user or dependency resumes the workflow.
- `end.*`: perform the required closeout and do not auto-continue.
- Keep low-complexity work lightweight when claw guidance says a full plan is
  unnecessary.

Do not request or discuss host actions, plan synchronization, Goal Mode, or
Worker lifecycle details.

### Completion

When all plan tasks are complete:

1. Complete the canonical plan transition through `call_tool`.
2. Report the completed work to the user. The Host captures that final report
   and then queues any required knowledge closeout.
3. Do not manually trigger sync or Goal handling.

Knowledge closeout must remain bounded to the current project and plan. A
failure must be visible and recoverable; never silently mark a failed closeout
as complete.
