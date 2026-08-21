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
/** Render the session-start guidance snapshot injected at session start.
 * Aligns with the Codex adapter's session-start hook: consumes the full
 * `claw context --host dsh` payload — activeWorkflow snapshot, version-sync
 * notice, protocol check, search guidance, and a project fallback — so the
 * model gets the same recovery and startup context on DSH that Codex
 * receives. Empty text contributes nothing to the assembly. */
export function renderGuidanceSnapshot(context) {
    if (!context || typeof context !== "object")
        return "";
    const lines = [];
    // Version sync notice (startupRecovery.versionSync), same contract as Codex.
    const startupRecovery = context.startupRecovery;
    const versionSync = startupRecovery?.versionSync;
    if (versionSync && typeof versionSync === "object") {
        const cliVersion = typeof versionSync.cliVersion === "string" ? versionSync.cliVersion : "";
        const latest = typeof versionSync.latestPublishedVersion === "string"
            ? versionSync.latestPublishedVersion
            : "";
        const message = typeof versionSync.message === "string" ? versionSync.message : "";
        if (versionSync.cliVersionLagging === true && versionSync.updateAvailable === true && cliVersion && latest) {
            lines.push(`A newer claw-kit version is available: installed CLI ${cliVersion}, published latest ${latest}. ` +
                "Tell the user their installed claw-kit is out of date and must be updated before continuing; " +
                "ask whether to update now and wait for the answer. After confirmation, use the update skill, " +
                "then continue the original task.");
        }
        else if (message) {
            lines.push(`Startup note: ${message}`);
        }
    }
    const activeWorkflow = context.activeWorkflow
        // Flat claw/execute output (e.g. plan.start / task.done) carries the
        // workflow fields at the top level; normalize it to the context shape so
        // the same renderer serves both session-start and per-mutation refreshes.
        ?? (context.workflowGuidance && typeof context.workflowGuidance === "object"
            ? (() => {
                const planView = context.planView && typeof context.planView === "object"
                    ? context.planView
                    : undefined;
                return {
                    planSummary: typeof context.planSummary === "string"
                        ? context.planSummary
                        : typeof planView?.collapsedSummary === "string"
                            ? planView.collapsedSummary
                            : undefined,
                    planStatus: context.planStatus,
                    workflowGuidance: context.workflowGuidance,
                };
            })()
            : undefined);
    const guidance = activeWorkflow?.workflowGuidance;
    if (activeWorkflow && guidance) {
        const snapshot = ["[claw workflow]"];
        if (typeof activeWorkflow.planSummary === "string")
            snapshot.push(`Plan: ${activeWorkflow.planSummary}`);
        if (typeof activeWorkflow.planStatus === "string")
            snapshot.push(`Status: ${activeWorkflow.planStatus}`);
        if (typeof guidance.stage === "string")
            snapshot.push(`Stage: ${guidance.stage}`);
        if (guidance.nextTask && typeof guidance.nextTask === "object") {
            const task = guidance.nextTask;
            if (typeof task.title === "string")
                snapshot.push(`Current task: ${task.title}`);
        }
        if (Array.isArray(guidance.nextsteps)) {
            snapshot.push("Next steps:");
            for (const step of guidance.nextsteps)
                snapshot.push(`- ${String(step)}`);
        }
        lines.push(snapshot.join("\n"));
        lines.push("Claw workflow snapshot is recovered. Treat the guidance as the only next-step contract.");
    }
    else {
        // No bound workflow: project fallback, mirroring the Codex hook.
        const project = context.project;
        if (project && typeof project === "object") {
            const projectName = typeof project.projectName === "string" && project.projectName.trim()
                ? project.projectName.trim()
                : typeof project.projectId === "string" && project.projectId.trim()
                    ? project.projectId.trim()
                    : "project";
            lines.push(`This session started inside claw project ${projectName}. Use the claw_run tool for plan, task, subplan, and search operations.`);
        }
    }
    const searchGuidance = context.searchGuidance;
    if (typeof searchGuidance === "string" && searchGuidance.trim()) {
        lines.push(searchGuidance.trim());
    }
    const protocolCheck = context.protocolCheck;
    if (protocolCheck && protocolCheck.ok !== true) {
        lines.push("Claw project protocol needs attention; run `claw check` to inspect and auto-correct.");
    }
    return lines.join("\n\n");
}
//# sourceMappingURL=protocol.js.map