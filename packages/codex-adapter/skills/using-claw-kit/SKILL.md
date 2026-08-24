---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent contract for guidance, lifecycle, and Codex plan mutations.
---
# using-claw-kit
## Availability boundary
If claw-kit, its CLI, or its workflow bridge is unavailable, skip claw-kit and continue the user's task directly. Do not claim that the task cannot proceed solely because claw-kit is unavailable.
For usage questions, read `../claw-kit-doc/SKILL.md` and only the relevant
host-update, configuration, or Truth/ADR reference.
## First Action
1. If the request is not expected to produce reusable project knowledge, skip this skill and work directly. Otherwise, invoke the fixed code-mode driver with `argv: ["plan", "create", "<title>"]`.
2. If a template-backed workflow skill fully owns the request, follow that skill's entry route so it supplies its adjacent template file.
3. Follow the returned `workflowGuidance` as the only lifecycle contract. Use its stage and current task to determine the current work; `commandHints` are argv syntax and lookup aids, not commands to run directly in the shell.
4. When SessionStart recovers an active session-bound plan, first determine whether the current user request explicitly changes, replaces, or cancels its goal. Record that revision before proceeding; otherwise, run `plan sync` through the code-mode bridge once before continuing it. It restores Progress and creates a Goal only when none is nonterminal.

## Lifecycle semantics
Treat Claw-kit as an assistive workflow tool. Use plans and tasks to focus
attention, coordinate work, and preserve progress; do not treat them as
immutable authority. Adjust the goal, scope, and task breakdown promptly when
user needs or new evidence require it. When an independently manageable scope
would keep expanding a parent task, create a subplan instead.

- `process.discussing`: execution is paused for user discussion. It is a stable cross-turn state that can start a plan or be re-entered from `process.active`; do not implement, enter Goal Mode, convert it to `wait`, or close it before the discussion is settled.
- `process.active`: downstream tasks are explicit and the user can hand off execution. Execute one task at a time and keep plan progress current through returned guidance.
- `process.wait`: when execution becomes blocked on user input or an external dependency, proactively move the plan to `process.wait`, then stop until returned guidance resumes it.
- `end.completed`: the canonical completed plan status. Its returned guidance uses stage `done`; follow its required closeout before closing.

## Investigation
Use `claw-kit:researcher` for bounded code or implementation investigations when it reduces main-thread context consumption.

## Codex mutation bridge
For every claw plan mutation, call the function below in code mode and change only `argv`, `workdir`, and `timeout_ms`. `argv` starts with `plan`, `task`, or `subplan`, excludes the `claw` executable and `--host`, and keeps every user value as a separate array item. The cached CLI driver validates results, consumes native host actions exactly once, and returns only stage-relevant fields.

```javascript
async function runClawPlanMutation({ argv, workdir, timeout_ms = 30000 }) {
  const cacheKey = "claw-kit:codex-driver:v15:s1";
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
    if (envelope?.cacheKey !== cacheKey || envelope?.driverVersion !== 15
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
- **Terminal dispatch gate (subagent policy only):** A valid `knowledgeDispatch` is the highest-priority closeout obligation in the claw-kit workflow. Complete this handoff through the designated knowledge finalizer before the final reply, other work, or plan closeout. Do not skip the handoff because it was easy to miss, the work appears to contain no knowledge, a collaboration tool is not visible, or you believe you lack permission. The finalizer decides whether the job produces a knowledge update.
- When a terminal plan mutation returns a valid `knowledgeDispatch` for `subagent`, honor `preferReuse: true`: call `list_agents`, then reuse only the same-thread worker named `knowledge_finalizer` with `followup_task` and the complete unchanged prompt. Only when that worker does not exist, call `spawn_agent` with that prompt, `fork_turns: "none"`, task name `knowledge_finalizer`, and any supplied `model` and `reasoningEffort` mapped to native fields; never load a user-facing delegate skill.
- The dispatched job already exists. Do not wait for the reused or new writer; immediately end the main turn after the accepted handoff. In `subagent` mode, `knowledge claim` collects the existing parent-turn report and Stop does not capture, queue, launch, or amend that job. The bridge cannot call collaboration tools, and `background` never returns this dispatch.
## Hard boundaries
- Run every supported plan mutation through the code-mode bridge without splitting host calls, reconstructing `hostActions` or `goalTool`, or repeating canonical transitions as compensation; if it returns `goalRecovery.command`, immediately run that command in a new code-mode call before replying.
- Codex has no direct-call fallback: every supported plan mutation goes through the bundled code-mode consumer.
- Goal-state inspection belongs only to the fixed driver or bundled consumer program; the agent must never call `get_goal` separately.
- Edit canonical plan state only through claw commands supplied or permitted by returned guidance.
- If code mode, the driver, or a required host tool is unavailable, skip the claw workflow and continue the user's task directly; do not substitute an unsupported plan mutation.
- Keep claw harness mechanics out of normal thread replies unless the user asks about them or they are necessary to explain a blocker or result.
- Keep claw-generated metadata and host prompts in English while preserving user-supplied project content in its original language.
