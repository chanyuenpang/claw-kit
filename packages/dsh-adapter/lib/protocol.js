/**
 * Pure protocol helpers for the DSH adapter: operation→daemon-input mapping
 * and the session-start guidance snapshot renderer. Kept free of Cordis and
 * process dependencies so they are directly unit-testable.
 */
/** Map one `claw_run` operation call (snake_case args) to the daemon's
 * canonical `claw/execute` input. Mirrors the Cindy adapter's sessionRequest
 * contract. Unknown operations pass args through and fail closed on the
 * daemon's validation. */
export function daemonInput(operation, args) {
    const str = (key) => typeof args[key] === "string" ? args[key] : undefined;
    const arr = (key) => Array.isArray(args[key]) ? args[key] : undefined;
    switch (operation) {
        case "plan.create":
            return {
                title: str("title") ?? "",
                ...(str("goal") !== undefined ? { goalText: str("goal") } : {}),
                ...(args.scope === "session" ? { scope: "session" } : {}),
                ...(str("template") !== undefined ? { templateName: str("template") } : {}),
                ...(str("template_file") !== undefined ? { templateFile: str("template_file") } : {}),
            };
        case "plan.start": {
            const updates = {};
            if (str("requirements") !== undefined)
                updates.requirementsSummary = str("requirements");
            if (arr("acceptance") !== undefined)
                updates.acceptanceCriteria = arr("acceptance");
            return {
                ...(Object.keys(updates).length ? { updates } : {}),
                ...(arr("add_tasks") !== undefined ? { appendTasks: arr("add_tasks") } : {}),
            };
        }
        case "plan.show":
            return { simple: args.simple === true };
        case "plan.wait":
            return {};
        case "plan.resume":
            return { operations: [{ type: "plan.status", status: "process.active" }] };
        case "plan.edit": {
            const updates = {};
            if (str("goal") !== undefined)
                updates.goalText = str("goal");
            if (str("summary") !== undefined)
                updates.planSummary = str("summary");
            const operations = [];
            if (Object.keys(updates).length)
                operations.push({ type: "plan.update", updates });
            if (str("status") !== undefined)
                operations.push({ type: "plan.status", status: str("status") });
            return { operations };
        }
        case "plan.done":
            return {
                ...(str("retrospective") !== undefined ? { retrospectiveSummary: str("retrospective") } : {}),
                ...(str("key_decision") !== undefined ? { keyDecisions: [str("key_decision")] } : {}),
            };
        case "task.add":
            return { tasks: [{ title: str("title") ?? "", ...(str("detail") !== undefined ? { detail: str("detail") } : {}) }] };
        case "task.edit":
            return {
                taskId: Number(args.id),
                ...(str("title") !== undefined ? { taskTitle: str("title") } : {}),
                ...(str("detail") !== undefined ? { taskDetail: str("detail") } : {}),
                ...(str("status") !== undefined ? { taskStatus: str("status") } : {}),
                ...(str("choice") !== undefined ? { taskChoiceId: str("choice") } : {}),
            };
        case "task.done": {
            const tasks = Array.isArray(args.tasks) ? args.tasks : [];
            const entries = tasks.length ? tasks : [{ id: Number(args.id ?? 0) }];
            return { tasks: entries };
        }
        case "subplan.create":
            return {
                parentTaskName: str("parent") ?? "",
                parentTaskId: Number(args.task_id ?? args.taskId ?? 0),
                ...(str("template") !== undefined ? { templateName: str("template") } : {}),
                ...(str("template_file") !== undefined ? { templateFile: str("template_file") } : {}),
            };
        case "search":
            return { query: str("query") ?? "" };
        default:
            return args;
    }
}
/** Render the compact `claw context --host dsh` snapshot injected at session
 * start. Empty text contributes nothing to the assembly. */
export function renderGuidanceSnapshot(context) {
    if (!context || typeof context !== "object")
        return "";
    const activeWorkflow = context.activeWorkflow;
    const guidance = activeWorkflow?.workflowGuidance;
    if (!activeWorkflow || !guidance)
        return "";
    const lines = ["[claw workflow]"];
    if (typeof activeWorkflow.planSummary === "string")
        lines.push(`Plan: ${activeWorkflow.planSummary}`);
    if (typeof activeWorkflow.planStatus === "string")
        lines.push(`Status: ${activeWorkflow.planStatus}`);
    if (typeof guidance.stage === "string")
        lines.push(`Stage: ${guidance.stage}`);
    if (guidance.nextTask && typeof guidance.nextTask === "object") {
        const task = guidance.nextTask;
        if (typeof task.title === "string")
            lines.push(`Current task: ${task.title}`);
    }
    if (Array.isArray(guidance.nextsteps)) {
        lines.push("Next steps:");
        for (const step of guidance.nextsteps)
            lines.push(`- ${String(step)}`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=protocol.js.map