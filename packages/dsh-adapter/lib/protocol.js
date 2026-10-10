/**
 * Pure protocol helpers for the DSH adapter: operation→daemon-input mapping
 * and the session-start guidance snapshot renderer. Kept free of Cordis and
 * process dependencies so they are directly unit-testable.
 */
import { serializeFailure } from "../lib/errors.js";
import { DSH_MUTATION_ROUTE_GUIDANCE } from "./route-guidance.js";
/**
 * A transport break after a daemon request has been sent leaves the mutation
 * outcome unknown: the daemon may have committed it before its response was
 * lost. Such a request must never be automatically replayed.
 */
export function isUncertainConnectionFailure(message) {
    return /SESSION_CONNECTION_LOST|CLAW_SESSION_(?:OPEN_)?TIMEOUT|claw session timeout|connection was interrupted|session connection/i
        .test(message);
}
/** Structured owner outcomes take precedence over legacy transport text. */
export function isUnknownCommandOutcome(error) {
    return error?.outcome !== undefined ? error.outcome === "unknown" : isUncertainConnectionFailure(error?.message ?? "");
}
export function operationFailureError(operation, error) {
    const failure = serializeFailure(error, { fallbackCode: "CLAW_COMMAND_FAILED", operation, origin: "dsh", fallbackOutcome: "unknown" });
    const evidence = [failure.phase && "phase=" + failure.phase, failure.effect && "effect=" + failure.effect, "outcome=" + failure.outcome].filter(Boolean).join(", ");
    const message = "claw operation failed: " + operation + " — " + failure.code + ": " + failure.message + " [" + evidence + "]"
        + (failure.effect === "partial" || failure.effect === "committed" || failure.outcome === "unknown" ? " Inspect canonical state; do not replay the operation." : "");
    return Object.assign(new Error(message), { ...failure, message });
}
export function unknownOperationError(operation, primary, diagnostics = []) {
    const failure = serializeFailure(primary, { fallbackCode: "CLAW_OPERATION_OUTCOME_UNKNOWN", operation, origin: "dsh", fallbackOutcome: "unknown" });
    const secondary = diagnostics.slice(0, 3).map(value => serializeFailure(value, { fallbackCode: "RECEIPT_DIAGNOSTIC_FAILED", operation: operation + ".receipt.read", origin: "dsh", fallbackOutcome: "unknown" }));
    const message = "CLAW_OUTCOME_UNKNOWN: " + failure.code + ": " + failure.message + ". Commit is not confirmed; do not replay this operation."
        + (secondary.length ? " Read-only diagnosis: " + secondary.map(e => e.code + ": " + e.message).join("; ") : "");
    return Object.assign(new Error(message), { ...failure, message, outcome: "unknown", diagnostics: [...(failure.diagnostics ?? []), ...secondary].slice(0, 3) });
}
/** Map one `claw_run` operation call (snake_case args) to the daemon's
 * canonical `claw/execute` input. Mirrors the Cindy adapter's sessionRequest
 * contract. Unknown operations fail closed before transport selection. */
function firstValue(args, ...keys) {
    for (const key of keys) {
        if (args[key] !== undefined)
            return args[key];
    }
    return undefined;
}
function stringValue(args, ...keys) {
    const value = firstValue(args, ...keys);
    return typeof value === "string" ? value : undefined;
}
function stringValues(args, ...keys) {
    const value = firstValue(args, ...keys);
    if (typeof value === "string")
        return [value];
    if (!Array.isArray(value))
        return undefined;
    return value.filter((item) => typeof item === "string");
}
function referenceValues(args) {
    const value = firstValue(args, "references", "reference");
    if (Array.isArray(value))
        return value;
    return value && typeof value === "object" ? [value] : undefined;
}
const PLAN_FIELD_ARG_KEYS = [
    "goal", "goal_text", "goalText",
    "requirements", "requirements_summary", "requirementsSummary",
    "questions", "open_questions", "question", "openQuestions",
    "remove_questions", "remove_open_questions", "removeOpenQuestions",
    "acceptance", "acceptance_criteria", "acceptanceCriteria",
    "remove_acceptance", "remove_acceptance_criteria", "removeAcceptanceCriteria",
    "summary", "plan_summary", "planSummary",
    "rules", "rule", "remove_rules", "remove_rule", "removeRules",
    "key_decisions", "key_decision", "keyDecisions",
    "remove_key_decisions", "remove_key_decision", "removeKeyDecisions",
    "references", "reference",
    "remove_reference_paths", "remove_references", "remove_reference", "removeReferencePaths",
    "retrospective", "retrospective_summary", "retrospectiveSummary",
    "what_worked", "whatWorked", "issues", "issue", "follow_ups", "follow_up", "followUps",
];
function assertKnownArgs(operation, args, keys) {
    const known = new Set(keys);
    const unknown = Object.keys(args).filter((key) => !known.has(key));
    if (unknown.length > 0) {
        throw new Error("Unsupported " + operation + " argument(s): " + unknown.join(", "));
    }
}
function planFieldUpdates(args) {
    const updates = {};
    const assignText = (target, ...keys) => {
        const value = stringValue(args, ...keys);
        if (value !== undefined)
            updates[target] = value;
    };
    const assignStrings = (target, ...keys) => {
        const value = stringValues(args, ...keys);
        if (value !== undefined)
            updates[target] = value;
    };
    assignText("goalText", "goal", "goal_text", "goalText");
    assignText("requirementsSummary", "requirements", "requirements_summary", "requirementsSummary");
    assignStrings("openQuestions", "questions", "open_questions", "question", "openQuestions");
    assignStrings("removeOpenQuestions", "remove_questions", "remove_open_questions", "removeOpenQuestions");
    assignStrings("acceptanceCriteria", "acceptance", "acceptance_criteria", "acceptanceCriteria");
    assignStrings("removeAcceptanceCriteria", "remove_acceptance", "remove_acceptance_criteria", "removeAcceptanceCriteria");
    assignText("planSummary", "summary", "plan_summary", "planSummary");
    assignStrings("rules", "rules", "rule");
    assignStrings("removeRules", "remove_rules", "remove_rule", "removeRules");
    assignStrings("keyDecisions", "key_decisions", "key_decision", "keyDecisions");
    assignStrings("removeKeyDecisions", "remove_key_decisions", "remove_key_decision", "removeKeyDecisions");
    const references = referenceValues(args);
    if (references !== undefined)
        updates.references = references;
    assignStrings("removeReferencePaths", "remove_reference_paths", "remove_references", "remove_reference", "removeReferencePaths");
    assignText("retrospectiveSummary", "retrospective", "retrospective_summary", "retrospectiveSummary");
    assignStrings("whatWorked", "what_worked", "whatWorked");
    assignStrings("issues", "issues", "issue");
    assignStrings("followUps", "follow_ups", "follow_up", "followUps");
    return updates;
}
function taskDoneEntry(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return value;
    const entry = value;
    const choice = stringValue(entry, "choice", "choice_id", "choiceId");
    const { choice: _choice, choice_id: _choiceId, ...rest } = entry;
    return {
        ...rest,
        ...(choice !== undefined ? { choiceId: choice } : {}),
    };
}
export function daemonInput(operation, args) {
    const str = (...keys) => stringValue(args, ...keys);
    const arr = (...keys) => {
        const value = firstValue(args, ...keys);
        return Array.isArray(value) ? value : undefined;
    };
    switch (operation) {
        case "plan.create":
            assertKnownArgs(operation, args, ["title", "goal", "goal_text", "description", "knowledge_capture", "template", "template_name", "template_file", "status", "force_planning", "tasks", "add_tasks"]);
            return {
                title: str("title") ?? "",
                ...(str("goal", "goal_text") !== undefined ? { goalText: str("goal", "goal_text") } : {}),
                ...(str("description") !== undefined ? { description: str("description") } : {}),
                ...(args.knowledge_capture !== undefined ? { knowledgeCapture: args.knowledge_capture } : {}),
                ...(str("template", "template_name") !== undefined ? { templateName: str("template", "template_name") } : {}),
                ...(str("template_file") !== undefined ? { templateFile: str("template_file") } : {}),
                ...(str("status") !== undefined ? { planStatus: str("status") } : {}),
                ...(typeof args.force_planning === "boolean" ? { forcePlanning: args.force_planning } : {}),
                ...(arr("tasks", "add_tasks") !== undefined ? { tasks: arr("tasks", "add_tasks") } : {}),
            };
        case "plan.start": {
            assertKnownArgs(operation, args, [...PLAN_FIELD_ARG_KEYS, "add_tasks", "tasks"]);
            const updates = planFieldUpdates(args);
            return {
                ...(Object.keys(updates).length ? { updates } : {}),
                ...(arr("add_tasks", "tasks") !== undefined ? { appendTasks: arr("add_tasks", "tasks") } : {}),
            };
        }
        case "plan.show":
            assertKnownArgs(operation, args, ["simple"]);
            return { simple: args.simple === true };
        case "context":
        case "plan.leave":
        case "plan.wait":
            assertKnownArgs(operation, args, []);
            return {};
        case "plan.resume": {
            assertKnownArgs(operation, args, ["plan_id", "planId", "id"]);
            const planId = str("plan_id", "planId", "id");
            return planId === undefined ? {} : { planId };
        }
        case "plan.edit": {
            assertKnownArgs(operation, args, [...PLAN_FIELD_ARG_KEYS, "status", "operations"]);
            const explicitOperations = arr("operations");
            if (explicitOperations !== undefined) {
                const mixed = Object.keys(args).filter((key) => key !== "operations");
                if (mixed.length > 0) {
                    throw new Error("plan.edit operations cannot be combined with mapped field arguments: " + mixed.join(", "));
                }
                return { operations: explicitOperations };
            }
            const updates = planFieldUpdates(args);
            const operations = [];
            if (Object.keys(updates).length)
                operations.push({ type: "plan.update", updates });
            if (str("status") !== undefined)
                operations.push({ type: "plan.status", status: str("status") });
            return { operations };
        }
        case "plan.done":
            assertKnownArgs(operation, args, PLAN_FIELD_ARG_KEYS);
            return planFieldUpdates(args);
        case "task.add": {
            assertKnownArgs(operation, args, ["title", "detail", "tasks", "add_tasks"]);
            const tasks = arr("tasks", "add_tasks");
            return tasks !== undefined
                ? { tasks }
                : { tasks: [{ title: str("title") ?? "", ...(str("detail") !== undefined ? { detail: str("detail") } : {}) }] };
        }
        case "task.edit":
            assertKnownArgs(operation, args, ["id", "task_id", "taskId", "title", "detail", "status", "choice", "choice_id", "choiceId"]);
            return {
                taskId: Number(firstValue(args, "id", "task_id", "taskId")),
                ...(str("title") !== undefined ? { taskTitle: str("title") } : {}),
                ...(str("detail") !== undefined ? { taskDetail: str("detail") } : {}),
                ...(str("status") !== undefined ? { taskStatus: str("status") } : {}),
                ...(str("choice", "choice_id", "choiceId") !== undefined ? { taskChoiceId: str("choice", "choice_id", "choiceId") } : {}),
            };
        case "task.remove": {
            assertKnownArgs(operation, args, ["id", "task_id", "taskId", "tasks", "task_ids"]);
            const list = arr("tasks", "task_ids");
            const ids = list !== undefined
                ? list.map((entry) => Number(entry && typeof entry === "object" ? entry.id : entry))
                : [Number(firstValue(args, "id", "task_id", "taskId"))];
            if (ids.some((id) => !Number.isInteger(id)))
                throw new Error("task.remove requires integer task id(s)");
            return { tasks: ids.map((id) => ({ id })) };
        }
        case "task.done": {
            assertKnownArgs(operation, args, ["id", "task_id", "taskId", "choice", "choice_id", "choiceId", "tasks"]);
            const tasks = arr("tasks") ?? [];
            const entries = tasks.length
                ? tasks.map(taskDoneEntry)
                : [taskDoneEntry({ id: Number(firstValue(args, "id", "task_id", "taskId") ?? 0), ...(str("choice", "choice_id", "choiceId") !== undefined ? { choiceId: str("choice", "choice_id", "choiceId") } : {}) })];
            return { tasks: entries };
        }
        case "subplan.create":
            assertKnownArgs(operation, args, ["parent", "parent_task_name", "task_id", "taskId", "parent_task_id", "template", "template_name", "template_file"]);
            return {
                ...(str("parent", "parent_task_name") !== undefined ? { parentTaskName: str("parent", "parent_task_name") } : {}),
                ...(firstValue(args, "task_id", "taskId", "parent_task_id") !== undefined
                    ? { parentTaskId: Number(firstValue(args, "task_id", "taskId", "parent_task_id")) } : {}),
                ...(str("template", "template_name") !== undefined ? { templateName: str("template", "template_name") } : {}),
                ...(str("template_file") !== undefined ? { templateFile: str("template_file") } : {}),
            };
        case "knowledge.claim":
        case "knowledge.claim.receipt":
            assertKnownArgs(operation, args, ["finalize_id"]);
            if (typeof args.finalize_id !== "string" || !/^[a-f0-9]{64}$/i.test(args.finalize_id))
                throw new Error("knowledge.claim requires a 64-character hexadecimal finalize_id");
            return { finalizeId: args.finalize_id };
        case "knowledge.done.receipt": {
            assertKnownArgs(operation, args, ["finalize_id", "claim_token", "expected_status", "expected_result"]);
            if (typeof args.finalize_id !== "string" || !/^[a-f0-9]{64}$/i.test(args.finalize_id))
                throw new Error("knowledge.done.receipt requires finalize_id");
            if (args.claim_token !== undefined && (typeof args.claim_token !== "string" || !args.claim_token.trim()))
                throw new Error("claim_token must be nonempty text when supplied");
            if (args.expected_status !== undefined && args.expected_status !== "succeeded" && args.expected_status !== "failed")
                throw new Error("Invalid expected_status");
            if (args.expected_result !== undefined && typeof args.expected_result !== "string")
                throw new Error("expected_result must be text");
            return { finalizeId: args.finalize_id, ...(args.claim_token !== undefined ? { claimToken: args.claim_token } : {}),
                ...(args.expected_status !== undefined ? { expectedStatus: args.expected_status } : {}),
                ...(args.expected_result !== undefined ? { expectedResult: args.expected_result } : {}) };
        }
        case "knowledge.done": {
            assertKnownArgs(operation, args, ["finalize_id", "claim_token", "status", "result", "error"]);
            if (typeof args.finalize_id !== "string" || !/^[a-f0-9]{64}$/i.test(args.finalize_id))
                throw new Error("knowledge.done requires a 64-character hexadecimal finalize_id");
            if (args.claim_token !== undefined && (typeof args.claim_token !== "string" || !args.claim_token.trim()))
                throw new Error("claim_token must be nonempty text when supplied");
            if (args.status !== "succeeded" && args.status !== "failed")
                throw new Error("knowledge.done status must be succeeded or failed");
            if (args.status === "succeeded" && typeof args.result !== "string")
                throw new Error("knowledge.done succeeded requires result");
            if (args.status === "failed" && (typeof args.error !== "string" || !args.error.trim()))
                throw new Error("knowledge.done failed requires error");
            if (args.status === "succeeded" && args.error !== undefined || args.status === "failed" && args.result !== undefined)
                throw new Error("knowledge.done cannot combine status with the opposite outcome field");
            return { finalizeId: args.finalize_id, ...(args.claim_token !== undefined ? { claimToken: args.claim_token } : {}), status: args.status, ...(args.status === "succeeded" ? { result: args.result } : { error: args.error }) };
        }
        case "search":
            assertKnownArgs(operation, args, ["query", "limit"]);
            return { query: str("query") ?? "", ...(typeof args.limit === "number" ? { limit: args.limit } : {}) };
        case "search.index.refresh":
            assertKnownArgs(operation, args, []);
            return {};
        default:
            throw new Error("Operation is outside the model command contract: " + operation);
    }
}
/** Render the session-start guidance snapshot injected at session start.
 * Aligns with the Codex adapter's session-start hook: consumes the full
 * `claw context --host dsh` payload — activeWorkflow snapshot, version-sync
 * notice, protocol check, search guidance, and a project fallback — so the
 * model gets the same recovery and startup context on DSH that Codex
 * receives. Host identity remains available even without recovered context. */
export function renderGuidanceSnapshot(context) {
    const hostIdentity = "[claw host]\nplatform: dsh\nAdapter-owned host identity, independent of model/provider or skill path. Host/session arguments remain adapter-owned.";
    if (!context || typeof context !== "object")
        return hostIdentity;
    const lines = [hostIdentity];
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
        lines.push(DSH_MUTATION_ROUTE_GUIDANCE);
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
            lines.push(`This session started inside claw project ${projectName}. Load the using-claw-kit skill as the main workflow skill for this session.`);
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