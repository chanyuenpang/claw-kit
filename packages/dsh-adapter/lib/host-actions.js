/**
 * Auto-consumer for the CLI-generated `hostActions` protocol
 * (`schemaVersion: 1`, tools `update_plan` / `create_goal` / `update_goal`).
 *
 * The DSH adapter consumes the exact same artifacts the Codex fixed code-mode
 * driver consumes — the CLI emits them host-neutrally for every
 * `isHostActionsHost` (codex | dsh) — but does it inside the claw_run tool's
 * execute instead of a model-evaluated envelope. Consumption is fail-open: a
 * consumer error never fails the underlying mutation.
 */
/**
 * Consume hostActions against DSH-native surfaces.
 *
 * - `create_goal` / `update_goal` → the native `goals` service, so DSH's own
 *   goal bar and `get_goal` reflect the claw plan lifecycle (the model never
 *   touches goal tools).
 * - `update_plan` → returned for the caller to project (progress projection is
 *   a P2 surface; the claw_run result already carries the compact guidance).
 *
 * @returns the list of consumed action ids, for the `goalSync` result field.
 */
export function consumeHostActions(actions, goals, agent) {
    const consumed = [];
    let projection;
    for (const action of Array.isArray(actions) ? actions : []) {
        if (action.schemaVersion !== 1 || typeof action.id !== "string")
            continue;
        const input = action.input ?? {};
        try {
            if (action.tool === "create_goal" && typeof input.objective === "string") {
                if (goals) {
                    goals.create(agent, { objective: input.objective });
                    consumed.push(action.id);
                }
            }
            else if (action.tool === "update_goal" && goals) {
                const current = goals.get(agent);
                if (current && (input.status === "complete" || input.status === "blocked")) {
                    goals.complete(agent, { id: current.id, revision: current.revision });
                    consumed.push(action.id);
                }
            }
            else if (action.tool === "update_plan") {
                projection = action;
            }
        }
        catch {
            // fail-open: projection/goal sync must never break a settled mutation
        }
    }
    return { consumed, projection };
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
    return visible;
}
//# sourceMappingURL=host-actions.js.map