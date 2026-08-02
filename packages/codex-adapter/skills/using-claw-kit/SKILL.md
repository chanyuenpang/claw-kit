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

A plan is the task's container, not a frozen script: even while `process.active` is advancing, adapt its requirements, scope, and tasks to new user needs. Keep the plan current rather than forcing changed work through stale tasks.

- For a complex sub-task with an independently manageable scope, prefer `claw subplan create` to hand it off into a smaller task boundary instead of continually expanding the parent plan.

- `process.discussing`: execution is paused for user discussion. It is a stable cross-turn state that can start a plan or be re-entered from `process.active`; do not implement, enter Goal Mode, convert it to `wait`, or close it before the discussion is settled.
- `process.active`: downstream tasks are explicit and the user can hand off execution. Execute one task at a time and keep plan progress current through returned guidance.
- `process.wait`: when execution becomes blocked on user input or an external dependency, proactively move the plan to `process.wait`, then stop until returned guidance resumes it.
- `end.completed`: the canonical completed plan status. Its returned guidance uses stage `done`; record the retrospective and durable key decisions, then close the plan through that guidance.

## Investigation

Use `claw-kit:researcher` for bounded code or implementation investigations when it reduces main-thread context consumption.

## Codex mutation bridge

For every claw plan mutation, call the function below in code mode and change only `argv`, `workdir`, and `timeout_ms`. `argv` starts with `plan`, `task`, or `subplan`, excludes the `claw` executable and `--host`, and keeps every user value as a separate array item. The cached CLI driver validates results, consumes native host actions exactly once, and returns only stage-relevant fields.

```javascript
async function runClawPlanMutation({ argv, workdir, timeout_ms = 30000 }) {
  const cacheKey = "claw-kit:codex-driver:v10:s1";
  let envelope = load(cacheKey);
  if (!envelope) {
    const raw = typeof tools.shell_command === "function" ? await tools.shell_command({ command: "claw codex driver", workdir, timeout_ms })
      : typeof tools.exec_command === "function" ? await tools.exec_command({ cmd: "claw codex driver", workdir, yield_time_ms: timeout_ms })
      : (() => { throw new Error("Codex host has no supported command-execution tool"); })();
    const output = typeof raw === "string" ? raw : (raw.output ?? raw.stdout ?? raw.text ?? "");
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}") + 1;
    if (start < 0 || end <= start) throw new Error("claw returned no driver envelope");
    envelope = JSON.parse(output.slice(start, end));
    if (envelope?.cacheKey !== cacheKey || envelope?.driverVersion !== 10
      || envelope?.hostActionSchemaVersion !== 1 || typeof envelope?.source !== "string") {
      throw new Error("incompatible claw Codex driver envelope");
    }
    store(cacheKey, envelope);
  }
  const runner = (0, eval)(`(${envelope.source})`);
  if (typeof runner !== "function") throw new Error("invalid claw Codex driver source");
  return runner({ argv, workdir, timeout_ms }, { tools, text });
}
```

## Knowledge subagent dispatch
- Session scope is temporary and does not persist project knowledge: it never returns a `knowledgeDispatch`; after its terminal mutation, finish the main turn without `spawn_agent`, `knowledge claim`, or any other knowledge-finalization step.
- When a terminal plan mutation returns a valid `knowledgeDispatch` for `subagent`, call native `spawn_agent` directly with its complete prompt, `fork_turns: "none"`, task name `knowledge_writer_<first 12 finalizeId characters>`, and any supplied `model` and `reasoningEffort` mapped to native fields; never load a user-facing delegate skill.
- The dispatched job already exists. Do not wait for that agent; immediately end the main turn after spawning it. In `subagent` mode, `knowledge claim` collects the existing parent-turn report and Stop does not capture, queue, launch, or amend the job. The bridge cannot call collaboration tools, and `background` never returns this dispatch.
## Hard boundaries

- Strongly prefer running plan mutations through the code-mode bridge without splitting host calls, reconstructing `hostActions` or `goalTool`, or repeating canonical transitions as compensation; if it returns `goalRecovery.command`, immediately run that command in a new code-mode call before replying.
- Goal-state inspection belongs only to the fixed driver or bundled consumer program; the agent must never call `get_goal` separately.
- Edit canonical plan state only through claw commands supplied or permitted by returned guidance.
- If code mode, the driver, or a required host tool is unavailable, stop with the program error; there is no direct-call fallback.
- Keep claw harness mechanics out of normal thread replies unless the user asks about them or they are necessary to explain a blocker or result.
- Keep claw-generated metadata and host prompts in English while preserving user-supplied project content in its original language.
