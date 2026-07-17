---
name: using-claw-kit
description: Use first whenever the @claw-kit plugin is invoked in a Codex thread; this is the main-agent workflow contract for plan, search, hook-aware reporting, and SDK-owned knowledge closeout.
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
7. Codex plan mutations use only the short code-mode bootstrap below. In one code-mode call, give `runClawPlanMutation` the claw command and working directory; the cached CLI driver owns JSON parsing, schema validation, action order, idempotency, input projection, and tool dispatch. The agent must not interpret `hostActions` or fall back to separate host calls. After dispatch, the driver returns only the structured fields useful to the next reasoning stage: stage/progress, next task, exact commands, delegation, user input, create-time plan/review, and closeout status when present. Protocol fields, consumed `hostActions`, `goalTool`, prose `nextsteps`, and generic notes are not agent-visible. The bundled `../../scripts/code-mode-host-action-consumer.mjs` is the testable source contract.
8. Use the search guidance returned by `claw context` when recall would help. `claw plan create` may expose `claw search --query "<topic>"` as an optional recommended command, but search is not a mandatory planning step.
9. Use two-part plan status semantics:
   - `process.discussing`: the plan exists, but execution has not started; stay in discussion/planning work only
   - `process.active`: execution is live; process one task at a time and update progress with `claw task edit` or `claw task done`
   - `process.wait`: the round is blocked on user input or an external dependency; enter with `claw plan wait` and return with `claw plan resume`
   - `end.completed`: all planned work is done and `retrospective.summary` is present
   - `end.closed` / `end.leave`: the round has been closed out; resume active execution when the user explicitly changes direction
10. The planning skill is invoked by the seeded planning task inside the formal claw workflow, not before task scope exists.
11. Once requirements are clear and `goal.text` is set, prefer the returned atomic `claw plan start` command with intuitive explicit flags such as `--requirements`, repeated `--acceptance`, and repeated `--add-task "<title>" --detail "<detail>"` groups to complete the planning bridge and enter `process.active` in one mutation. Generic patch files are not part of the plan contract.
12. When several same-type plan or task mutations are already known, repeat the existing option or `--id` group in one command. Arguments execute from left to right and stop at the first semantic failure; follow only the final returned guidance.
12. Every Stop hook appends the turn's final assistant message to the report owned by the current plan or subplan. The main agent does not curate, dual-write, or dispatch this report.
13. When all tasks are done, clear thread progress and update both `retrospective` and `keyDecisions`.
14. Close the plan with `claw plan done`. This canonical operation must immediately resume the parent plan for a subplan or unbind a completed root plan, regardless of hook health.
15. The independent Stop hook gives the completion turn to the just-completed plan, then queues the combined `knowledge-writer` through the Codex SDK. Do not dispatch truth or ADR writers from the main thread and do not wait for deposition.
16. During closeout, if this task included a git commit flow, inspect the repo for task-related doc artifacts that still belong to this round:
    - include canonical truth or ADR files updated by the writers
    - include any remaining task-produced docs that should ship with the same commit instead of leaving them behind

## Codex code-mode driver

Use this short bootstrap for every claw plan mutation. Change only `command`, `workdir`, and `timeout_ms`. It loads the versioned driver from the CLI once per code-mode session, stores the serializable envelope, and reuses it on later mutations. The evaluated driver still owns CLI execution and every returned host action in the same code-mode call.

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

## Report and knowledge closeout

Plan create and subplan create register one current report owner for the session. A subplan owns only its own turns; completing it restores the parent as the next turn's owner. `plan done` records a pending completion owner without delaying or replacing the canonical plan transition. The Stop hook writes exactly one report, preferring that pending completed plan for the completion turn.

The Codex SDK worker receives only the completed plan path, its adjacent report, and a finalization id. Its combined `knowledge-writer` independently decides whether truth, ADR, both, or neither deserve deposition, then the host requests project recall indexing. SDK or hook failure is fail-open and must never alter plan/session state.

## Non-negotiable rules

- The most essential rule is to follow returned `workflowGuidance`.
- The second essential rule is to keep canonical plan transitions independent from hook/report/SDK closeout.
- User authorization already covers goal mode and any non-deposition delegated subagents required by returned workflow guidance.
- Low-complexity requests skip the claw workflow before `claw plan create`, so they do not produce `workflowGuidance`.
- Treat `claw search` from context or plan recommendations as optional project recall. Use it when relevant, with natural language in the user's preferred language; do not make it a mandatory template step.
- Whenever claw returns `workflowGuidance`, use it as the single next-step process.
- On Codex, every claw plan mutation must run through the bundled code-mode consumer. The agent supplies only the command and working directory; it must not hand-write action branches or manually carry any host payload into another call.
- `hostActions` is the only Codex host-execution source inside the fixed driver. After successful dispatch, it is removed from the agent-visible result. Codex compact results do not return `workflowGuidance.goalTool`; non-Codex compatibility metadata must never be reconstructed or trigger a second Codex goal call.
- If code mode or a required Codex host tool is unavailable, stop with the program error. Codex has no direct-call or split-call fallback path.
- Keep claw-generated guidance, return metadata, and host prompt text in English. Preserve user-supplied titles, goals, requirements, and repository document language as provided.
- Never dispatch `truth-writer`, `adr-writer`, or `knowledge-writer` from the main agent. The Stop hook and SDK worker own deposition.
