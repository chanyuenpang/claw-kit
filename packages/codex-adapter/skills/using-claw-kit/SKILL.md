---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent workflow contract for plan, search, truth, ADR, and hook-aware startup.
---
# using-claw-kit

Claw-kit is designed to write and reuse truth-doc and ADR-doc in a plan framework.

This skill is the first skill whenever the `@claw-kit` plugin is invoked.

This is the main-agent entry skill. Keep it compact.
Use it to recover startup shape, route into the right `.claw` workflow, and follow CLI `workflowGuidance` as the contract.
If the user explicitly asks to initialize a non-claw project, route to `../init/SKILL.md`.

## Core execution chain

Detailed call flow:

1. If the current thread already has recovered `.claw` task state or returned `workflowGuidance`, continue from that contract first.
2. If the user explicitly invoked a template-backed workflow skill such as `claw-kit:create-claw-skill`, let that workflow skill own entry and follow its direct, batch, mixed, or subplan routing rules.
3. If no task scope exists yet and no explicit workflow skill owns entry, run a quick complexity scoring pass before creating any plan.
4. For low-complexity work, handle the request directly in the host workflow; claw planning, search, and `workflowGuidance` remain inactive.
5. Only for score `>= 6`, enter the normal claw workflow through `claw plan create`.
6. Whenever a claw command returns `workflowGuidance`, follow it as the required next-step contract. This is mandatory.
7. Codex plan mutations use only the fixed code-mode driver below. In one code-mode call, give `runClawPlanMutation` the claw command and working directory; the driver owns JSON parsing, schema validation, action order, idempotency, input projection, and tool dispatch. The agent must not interpret `hostActions`, execute `goalTool`, or fall back to separate host calls. The bundled `../../scripts/code-mode-host-action-consumer.mjs` is the testable source contract for this driver.
8. If prior project context is relevant, run `claw search --query "<topic>"` after a new `claw plan create` and use the results to improve the bound task scope.
9. Use two-part plan status semantics:
   - `process.discussing`: the plan exists, but execution has not started; stay in discussion/planning work only
   - `process.active`: execution is live; process one task at a time and update progress with `claw plan edit`
   - `process.wait`: the round is blocked on user input or an external dependency
   - `end.completed`: all planned work is done and `retrospective.summary` is present
   - `end.closed` / `end.leave`: the round has been closed out; resume active execution when the user explicitly changes direction
10. The planning skill is invoked by the seeded planning task inside the formal claw workflow, not before task scope exists.
11. Once requirements are clear and `goal.text` is set, prefer the returned atomic `claw plan start --task <name> --patch <plan-patch.json> --append-tasks <tasks.json>` command to complete the planning bridge and enter `process.active` in one mutation.
12. After a meaningful completed task, dispatch `truth-writer` when there is reusable context to deposit.
13. When all tasks are done, clear thread progress, update both `retrospective` and `keyDecisions`, and dispatch `adr-writer` asynchronously from returned `workflowGuidance`.
14. Close the plan with `claw plan done` after the ADR writer has been dispatched; do not wait for it. Delayed archive keeps the completed plan path readable for at least one hour.
15. During closeout, confirm whether the workflow actually dispatched the required writer specialists:
    - verify `truth-writer` and `adr-writer` were dispatched when the returned contract required them
    - report truth or ADR closeout as dispatched after each required delegation has occurred; do not imply asynchronous writer completion without evidence
16. During closeout, if this task included a git commit flow, inspect the repo for task-related doc artifacts that still belong to this round:
    - include canonical truth or ADR files updated by the writers
    - include any remaining task-produced docs that should ship with the same commit instead of leaving them behind

## Codex code-mode driver

Use this fixed program for every claw plan mutation. Change only `command`, `workdir`, and `timeout_ms`.

```javascript
async function runClawPlanMutation({ command, workdir, timeout_ms = 30000 }) {
  const raw = await tools.shell_command({ command, workdir, timeout_ms });
  const outputText = typeof raw === "string" ? raw : (raw.output ?? raw.stdout ?? raw.text ?? "");
  const start = outputText.indexOf("{");
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let index = start; index >= 0 && index < outputText.length; index += 1) {
    const character = outputText[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) { end = index + 1; break; }
  }
  if (start < 0 || end < 0) throw new Error("claw returned no complete JSON result");
  const result = JSON.parse(outputText.slice(start, end));
  if (result.ok !== true) throw new Error(`claw mutation failed: ${result.command ?? "unknown"}`);
  const allowedInput = {
    update_plan: new Set(["explanation", "plan"]),
    ensure_goal: new Set(["targetStatus", "objective"]),
  };
  const ensureGoal = async ({ targetStatus, objective }) => {
    const message = (error) => typeof error?.message === "string" ? error.message : String(error);
    const unfinished = (error) => /cannot create a new goal because this thread has an unfinished goal/i.test(message(error));
    const noGoal = (error) => /(no|does not have an?) (active|unfinished) goal|has no (active|unfinished) goal/i.test(message(error));
    if (targetStatus !== "active") {
      try { await tools.update_goal({ status: targetStatus }); }
      catch (error) { if (!noGoal(error)) throw error; }
      return;
    }
    try { await tools.create_goal({ objective }); return; }
    catch (error) { if (!unfinished(error)) throw error; }
    try { await tools.update_goal({ status: "complete" }); }
    catch (error) { if (!noGoal(error)) throw error; }
    await tools.create_goal({ objective });
  };
  const consumed = new Set();
  for (const action of result.hostActions ?? []) {
    const supported = (action?.tool === "update_plan" && action.schemaVersion === 1)
      || (action?.tool === "ensure_goal" && action.schemaVersion === 2);
    if (!supported || typeof action.id !== "string") {
      throw new Error(`unsupported Codex hostAction: ${action?.id ?? "unknown"}`);
    }
    if (consumed.has(action.id)) continue;
    if (!action.input || Object.keys(action.input).some((key) => !allowedInput[action.tool].has(key))) {
      throw new Error(`invalid Codex hostAction input: ${action.id}`);
    }
    if (action.tool === "ensure_goal") {
      const validTarget = ["active", "blocked", "complete"].includes(action.input.targetStatus);
      const validObjective = action.input.targetStatus === "active"
        ? typeof action.input.objective === "string" && action.input.objective.length > 0
        : action.input.objective === undefined;
      if (!validTarget || !validObjective) throw new Error(`invalid Codex hostAction input: ${action.id}`);
    }
    if (action.tool === "ensure_goal") await ensureGoal(action.input);
    else await tools.update_plan(action.input);
    consumed.add(action.id);
  }
  text(raw);
  return result;
}
```

## Complexity gate

Use this quick scoring pass only when there is no recovered task state yet and you are deciding whether to enter the claw workflow at all:

| Dimension | Simple (1) | Medium (2) | Complex (3) |
| --- | --- | --- | --- |
| Files/modules touched | no file changes, or 1 file or one tight module | 2-3 files/modules | 4+ files/modules or a cross-cutting surface |
| Requirement clarity | fully clear / the request itself is an investigation | one or two small unknowns | fuzzy, conflicting, or multiple plausible routes |
| Distinct dependency risk | none, isolated, or already counted by file/workflow shape (0) | one known integration boundary (1) | unclear external dependency or independent integration risk (2) |
| Workflow shape | discussion / doc-only work / tiny patch / direct answer | light implementation with a short verify step | real workflow, staged work, or multi-step closure |

Scoring rule:

- score `< 6`: skip the claw workflow and handle the request directly
- score `>= 6`: use `claw plan create` and continue with the normal claw workflow
- Count dependency risk only when it is distinct from file count and workflow shape; known dependencies alone add `0`, preventing the same complexity from being counted twice.

## First action

Explicit non-claw project bootstrap requests route to `init` instead of a broader startup sequence.
If the current thread already has a recovered `.claw` task, active plan, or returned `workflowGuidance`, follow that contract before creating anything.
If the user explicitly invoked a template-backed workflow skill, let that skill own entry and follow its required entry routing first. Template-backed skills may route direct single-target work into `plan create --template`, but batch or mixed work may need a normal root plan and execution-time template subplans instead.
If no task scope exists and no explicit workflow skill owns entry, run the complexity gate first. For score `< 6`, skip the claw workflow and work directly without creating a plan. For score `>= 6`, call `claw plan create "<goal/title>"`, then follow the returned `workflowGuidance`.

Edit `plan.json` through claw commands.
Template-aware workflow behavior may be restored from persisted runtime plan state such as `plan.templateId`, template-scoped override data, and template-defined guidance routing. Treat returned `workflowGuidance` as the contract instead of inferring hidden routing from task prose alone.

## Truth & ADR

The current thread is already authorized to use the required delegated subagents. If subagent tools are not already present in the current surface, `tool_search` is the discovery path.
Writer dispatch reuses an existing suitable same-type subagent before spawning a new one.
Attach the returned writer skill when spawning the worker; the writer skill remains inside the delegated subagent context.
Truth-value judgment stays on the main agent side. If there is no reusable truth, no writer is dispatched.
`truth-writer` dispatch happens only when the completed work has reusable truth.
`adr-writer` is a required, asynchronous closeout step for root-plan completion.

## Non-negotiable rules

- The most essential rule is to follow returned `workflowGuidance`.
- The second essential rule is to decide each turn whether to dispatch `truth-writer`.
- User authorization already covers goal mode and the required delegated subagents for this thread.
- Low-complexity requests skip the claw workflow before `claw plan create`, so they do not produce `workflowGuidance`.
- `claw search` runs after a new `claw plan create` when project recall is relevant. Search uses natural language and prefers the user's language.
- Whenever claw returns `workflowGuidance`, use it as the single next-step process.
- On Codex, every claw plan mutation must run through the bundled code-mode consumer. The agent supplies only the command and working directory; it must not hand-write action branches or manually carry any host payload into another call.
- `hostActions` is the only Codex host-execution source. `workflowGuidance.goalTool` is compatibility metadata for other consumers and must never trigger a second Codex goal call.
- If code mode or a required Codex host tool is unavailable, stop with the program error. Codex has no direct-call or split-call fallback path.
- Reuse the existing `truth-writer` when possible; otherwise dispatch a new one.
- Dispatch ADR deposition from the `all tasks done` guidance before root `claw plan done`, but do not wait for completion.
