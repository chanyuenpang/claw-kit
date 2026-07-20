---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent contract for guidance, lifecycle, and Codex plan mutations.
---
# using-claw-kit

If the request is not expected to produce reusable project knowledge, skip this skill and work directly.

## First Action

1. By default, run `claw plan create "<title>"`.
2. If a template-backed workflow skill fully owns the request, follow that skill's entry route so it supplies its adjacent template file.
3. Follow the returned `workflowGuidance` as the only lifecycle contract. Use its stage and current task to determine the current work; `commandHints` are command lookup aids, not required next mutations.

## Lifecycle semantics

A plan is the task's container, not a frozen script: even while `process.active` is advancing, adapt the plan to new user requirements and add sub-tasks when needed to complete the task.

- `process.discussing`: execution is paused for user discussion. It is a stable cross-turn state that can start a plan or be re-entered from `process.active`; do not implement, enter Goal Mode, convert it to `wait`, or close it before the discussion is settled.
- `process.active`: downstream tasks are explicit and the user can hand off execution. Execute one task at a time and keep plan progress current through returned guidance.
- `process.wait`: active execution is blocked on user input or an external dependency. Stop until returned guidance resumes it.
- `end.completed`: the canonical completed plan status. Its returned guidance uses stage `done`; record the retrospective and durable key decisions, then close the plan through that guidance.
- Claw automatically deposits reusable knowledge into canonical Truth documents during eligible closeout flows; resulting Truth file changes are normal workflow output, including while other tasks run in parallel.

## Codex mutation bridge

For every claw plan mutation, call the function below in code mode and change only `command`, `workdir`, and `timeout_ms`. The cached CLI driver validates results, consumes native host actions exactly once, and returns only stage-relevant fields.

```javascript
async function runClawPlanMutation({ command, workdir, timeout_ms = 30000 }) {
  const cacheKey = "claw-kit:codex-driver:v6:s1";
  let envelope = load(cacheKey);
  if (!envelope) {
    const raw = await tools.shell_command({ command: "claw codex driver", workdir, timeout_ms });
    const output = typeof raw === "string" ? raw : (raw.output ?? raw.stdout ?? raw.text ?? "");
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}") + 1;
    if (start < 0 || end <= start) throw new Error("claw returned no driver envelope");
    envelope = JSON.parse(output.slice(start, end));
    if (envelope?.cacheKey !== cacheKey || envelope?.driverVersion !== 6
      || envelope?.hostActionSchemaVersion !== 1 || typeof envelope?.source !== "string") {
      throw new Error("incompatible claw Codex driver envelope");
    }
    store(cacheKey, envelope);
  }
  const runner = (0, eval)(`(${envelope.source})`);
  if (typeof runner !== "function") throw new Error("invalid claw Codex driver source");
  return runner({ command, workdir, timeout_ms }, { tools, text });
}
```

## Hard boundaries

- Treat `claw subplan create` as an atomic Goal handoff: its returned host actions must complete the active parent goal before any child-plan goal is created. Never overwrite a still-active parent goal with the subplan objective.
- Never run a plan mutation outside the code-mode bridge, split its host calls, reconstruct `hostActions` or `goalTool`, or repeat a canonical transition as compensation.
- Goal-state inspection belongs only to the fixed driver or bundled consumer program; the agent must never call `get_goal` separately.
- Edit canonical plan state only through claw commands supplied or permitted by returned guidance.
- If code mode, the driver, or a required host tool is unavailable, stop with the program error; there is no direct-call fallback.
- Keep claw harness mechanics out of normal thread replies unless the user asks about them or they are necessary to explain a blocker or result.
- Keep claw-generated metadata and host prompts in English while preserving user-supplied project content in its original language.
