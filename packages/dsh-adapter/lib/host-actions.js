/**
 * Auto-consumer for the CLI-generated `hostActions` protocol
 * (`schemaVersion: 1`, tools `update_plan` / `create_goal` / `update_goal`).
 *
 * The DSH adapter consumes the exact same artifacts the Codex fixed code-mode
 * driver consumes — the CLI emits them host-neutrally for every
 * `isHostActionsHost` (Codex | DSH) — but does it inside the claw_run tool's
 * execute instead of a model-evaluated envelope. Consumption is fail-open: a
 * consumer error never fails the underlying mutation.
 */
import { DSH_MUTATION_ROUTE_GUIDANCE } from "./route-guidance.js";
/**
 * Consume hostActions against DSH-native surfaces.
 *
 * - `create_goal` / `update_goal` → the native `goals` service, so DSH's own
 *   goal bar and `get_goal` reflect the claw plan lifecycle (the model never
 *   touches goal tools). DSH has no native blocked state: a legal `blocked`
 *   transition completes the native Goal, and a later create action opens a
 *   fresh one.
 * - `update_plan` → returned for the caller to project (progress projection is
 *   a P2 surface; the claw_run result already carries the compact guidance).
 *
 * @returns the list of consumed action ids, for the `goalSync` result field.
 */
export function consumeHostActions(actions, goals, agent) {
    const consumed = [];
    const consumedIds = new Set();
    let projection;
    const failures = [];
    for (const action of Array.isArray(actions) ? actions : []) {
        const record = action && typeof action === "object" && !Array.isArray(action)
            ? action
            : undefined;
        if (!record || typeof record.id !== "string" || !record.id || !record.input || typeof record.input !== "object" || Array.isArray(record.input)) {
            failures.push({ code: "INVALID_ACTION", message: "Host action must contain a non-empty id and object input." });
            continue;
        }
        if (consumedIds.has(record.id)) {
            continue;
        }
        if (record.schemaVersion !== 1) {
            failures.push({
                actionId: record.id,
                ...(typeof record.tool === "string" ? { tool: record.tool } : {}),
                code: "UNSUPPORTED_SCHEMA",
                message: `Unsupported host action schemaVersion: ${String(record.schemaVersion)}.`,
            });
            continue;
        }
        if (!['update_plan', 'create_goal', 'update_goal'].includes(String(record.tool))) {
            failures.push({
                actionId: record.id,
                ...(typeof record.tool === "string" ? { tool: record.tool } : {}),
                code: "UNSUPPORTED_TOOL",
                message: `Unsupported host action tool: ${String(record.tool)}.`,
            });
            continue;
        }
        const typedAction = record;
        const input = typedAction.input;
        try {
            if (typedAction.tool === "create_goal") {
                if (!goals) {
                    failures.push({ actionId: typedAction.id, tool: typedAction.tool, code: "SERVICE_UNAVAILABLE", message: "DSH goals service is unavailable." });
                }
                else if (typeof typedAction.input.objective !== "string" || !typedAction.input.objective) {
                    failures.push({ actionId: typedAction.id, tool: typedAction.tool, code: "INVALID_ACTION", message: "create_goal requires a non-empty objective." });
                }
                else if (goals.get(agent)) {
                    // The shared contract treats an existing native Goal as unfinished:
                    // recovery must retain it rather than overwrite it.
                    consumedIds.add(typedAction.id);
                    consumed.push(typedAction.id);
                }
                else {
                    goals.create(agent, { objective: typedAction.input.objective });
                    consumedIds.add(typedAction.id);
                    consumed.push(typedAction.id);
                }
            }
            else if (typedAction.tool === "update_goal" && goals) {
                const current = goals.get(agent);
                if (current && (typedAction.input.status === "complete" || typedAction.input.status === "blocked")) {
                    goals.complete(agent, { id: current.id, revision: current.revision });
                    consumedIds.add(typedAction.id);
                    consumed.push(typedAction.id);
                }
                else if (typedAction.input.status === "complete" || typedAction.input.status === "blocked") {
                    // A DSH Goal is either native-active or absent. Once `blocked` has
                    // mapped to native completion, a later `complete` is a consumed
                    // no-op under the shared transition contract.
                    consumedIds.add(typedAction.id);
                    consumed.push(typedAction.id);
                }
            }
            else if (typedAction.tool === "update_goal") {
                failures.push({ actionId: typedAction.id, tool: typedAction.tool, code: "SERVICE_UNAVAILABLE", message: "DSH goals service is unavailable." });
            }
            else if (typedAction.tool === "update_plan") {
                if (!Array.isArray(typedAction.input.plan)) {
                    failures.push({ actionId: typedAction.id, tool: typedAction.tool, code: "INVALID_ACTION", message: "update_plan requires a plan array." });
                }
                else {
                    projection = typedAction;
                }
            }
        }
        catch (error) {
            failures.push({
                actionId: typedAction.id,
                tool: typedAction.tool,
                code: "APPLY_FAILED",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return { consumed, projection, failures };
}
/**
 * Whitelist-only compact view of a daemon `claw/execute` output — the same
 * visible-field contract the Codex driver applies (stage, plan summary,
 * next steps, notes, next task, command hints, askUser, plan).
 */
export function compactClawOutput(output) {
    if (!output || typeof output !== "object")
        return { ok: true, command: "claw" };
    const guidance = output.workflowGuidance && typeof output.workflowGuidance === "object"
        ? output.workflowGuidance
        : undefined;
    const visible = {
        ok: true,
        command: typeof output.command === "string" ? output.command : "claw",
    };
    if (typeof output.planStatus === "string")
        visible.planStatus = output.planStatus;
    if (guidance) {
        if (typeof guidance.stage === "string")
            visible.stage = guidance.stage;
        if (Array.isArray(guidance.nextsteps))
            visible.nextsteps = guidance.nextsteps;
        if (typeof guidance.notes === "string" && guidance.notes.trim())
            visible.notes = guidance.notes;
        if (guidance.nextTask !== undefined)
            visible.nextTask = guidance.nextTask;
        if (Array.isArray(guidance.commandHints))
            visible.commandHints = guidance.commandHints;
        if (guidance.askUser !== undefined)
            visible.askUser = guidance.askUser;
        if (guidance.summary !== undefined)
            visible.planSummary = guidance.summary;
    }
    const planView = output.planView && typeof output.planView === "object"
        ? output.planView
        : undefined;
    if (planView && typeof planView.collapsedSummary === "string") {
        visible.planSummary = visible.planSummary ?? planView.collapsedSummary;
    }
    if (output.plan !== undefined && output.planStatus === "process.discussing") {
        visible.plan = output.plan;
    }
    if (output.planPath !== undefined)
        visible.planPath = output.planPath;
    if (output.achievement !== undefined)
        visible.achievement = output.achievement;
    // Search recall must be fully visible: the model needs the result list to
    // route follow-ups (the Codex driver surfaces search output verbatim).
    if (output.query !== undefined)
        visible.query = output.query;
    if (Array.isArray(output.results)) {
        visible.results = output.results.map((entry) => {
            if (entry && typeof entry === "object") {
                const e = entry;
                // Keep only the useful surface per hit: path, kind, snippet, score.
                return {
                    ...(e.sourcePath !== undefined ? { sourcePath: e.sourcePath } : {}),
                    ...(e.kind !== undefined ? { kind: e.kind } : {}),
                    ...(e.snippet !== undefined ? { snippet: e.snippet } : {}),
                    ...(e.score !== undefined ? { score: e.score } : {}),
                };
            }
            return entry;
        });
    }
    if (output.count !== undefined)
        visible.count = output.count;
    // plan.show --simple returns a minimal projection {status, goal, tasks};
    // keep it visible so the model can still read the plan at a glance.
    if (typeof output.status === "string")
        visible.planStatus = output.status;
    if (output.goal !== undefined && typeof output.goal === "object") {
        const g = output.goal;
        if (typeof g.text === "string")
            visible.goal = g.text;
    }
    if (Array.isArray(output.tasks)) {
        visible.tasks = output.tasks.map((task) => {
            if (task && typeof task === "object") {
                const t = task;
                return {
                    ...(t.title !== undefined ? { title: t.title } : {}),
                    ...(t.status !== undefined ? { status: t.status } : {}),
                    ...(t.detail !== undefined ? { detail: t.detail } : {}),
                    ...(t.id !== undefined ? { id: t.id } : {}),
                };
            }
            return task;
        });
    }
    const command = typeof output.command === "string" ? output.command : "";
    const isWorkflowMutation = /^(plan|task|subplan)\.(?!show$)/.test(command);
    if (isWorkflowMutation) {
        const existingNotes = typeof visible.notes === "string" ? visible.notes.trim() : "";
        visible.notes = existingNotes
            ? `${DSH_MUTATION_ROUTE_GUIDANCE} ${existingNotes}`
            : DSH_MUTATION_ROUTE_GUIDANCE;
    }
    return visible;
}
//# sourceMappingURL=host-actions.js.map