---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent contract for guidance, lifecycle, and Codex plan mutations.
---
# using-claw-kit

Use this skill to enter or resume `.claw` work and consume CLI `workflowGuidance` correctly.

## Guidance contract

- Returned or recovered `workflowGuidance` is the only next-step contract. Follow its stage, user-input request, and exact recommended commands instead of reconstructing a default workflow from this skill.
- If a recovered plan or guidance exists, continue it before creating anything. If an explicitly invoked template-backed workflow skill owns entry, let that skill route the request.
- With no task scope, create a plan when reusable project knowledge is expected; otherwise work directly. A new plan starts in `process.discussing`.
- Use `claw search` only when returned guidance recommends recall or project context would materially help.

## Lifecycle semantics

- `process.discussing`: a stable cross-turn state for planning and user collaboration. Do not implement, enter Goal Mode, convert it to `wait`, or close it merely because discussion continues.
- `process.active`: downstream tasks are explicit and the user can hand off execution. Execute one task at a time and keep plan progress current through returned guidance.
- `process.wait`: active execution is blocked on user input or an external dependency. Stop until returned guidance resumes it.
- `end.completed`: the canonical completed plan status. Its returned guidance uses stage `done`; record the retrospective and durable key decisions, then close the plan through that guidance.

## Codex mutation bridge

For every claw plan mutation, call the function below in code mode and change only `command`, `workdir`, and `timeout_ms`. The cached CLI driver validates results, consumes native host actions exactly once, and returns only stage-relevant fields.

```javascript
async function runClawPlanMutation({ command, workdir, timeout_ms = 30000 }) {
  const cacheKey = "claw-kit:codex-driver:v3:s1";
  let envelope = load(cacheKey);
  if (!envelope) {
    const raw = await tools.shell_command({ command: "claw codex driver", workdir, timeout_ms });
    const output = typeof raw === "string" ? raw : (raw.output ?? raw.stdout ?? raw.text ?? "");
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}") + 1;
    if (start < 0 || end <= start) throw new Error("claw returned no driver envelope");
    envelope = JSON.parse(output.slice(start, end));
    if (envelope?.cacheKey !== cacheKey || envelope?.driverVersion !== 3
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

- Never run a plan mutation outside the code-mode bridge, split its host calls, reconstruct `hostActions` or `goalTool`, or repeat a canonical transition as compensation.
- Edit canonical plan state only through claw commands supplied or permitted by returned guidance.
- If code mode, the driver, or a required host tool is unavailable, stop with the program error; there is no direct-call fallback.
- Keep claw-generated metadata and host prompts in English while preserving user-supplied project content in its original language.
