import { serializeFailure } from "../lib/errors.js";
import fs from "node:fs";
import path from "node:path";
import { extractPlanConversation } from "./capture.js";
import { terminateForCleanup, ClawSession } from "./claw-session.js";
import { compactClawOutput, consumeHostActions, } from "./host-actions.js";
import { daemonInput, unknownOperationError, isUnknownCommandOutcome, operationFailureError, renderGuidanceSnapshot } from "./protocol.js";
import { registerBundledSkills } from "./skills.js";
import { routeCommand, runCommandBaseline, resolveCommandEntry } from "./command-route.js";
import { handleProjectConfigRpc } from "./project-config-rpc.js";
import { createSourceFinalizerDispatcher } from "./source-finalizer.js";
import { RoleDelegation } from "./delegation.js";
import { selectDshRoleModel } from "./model-selection.js";
import { mountConnectionRpcChannels } from "./connection-rpc.js";
export const name = "claw-kit";
function isDirectory(candidate) {
    if (typeof candidate !== "string" || !candidate.trim())
        return false;
    try {
        return fs.statSync(candidate).isDirectory();
    }
    catch {
        return false;
    }
}
async function resolveWorkdir(agent, workspaceRegistry) {
    // 1. Agent public API exposes no cwd getter; prefer the session header —
    //    the durable, authority-backed cwd inherited from the parent workspace
    //    (subagent children copy parentHeader.cwd at creation). Then fall back
    //    to the legacy meta/cwd shapes used by earlier adapter versions.
    for (const candidate of [
        agent?.session?.header?.cwd,
        agent?.session?.cwd,
        agent?.session?.meta?.cwd,
    ]) {
        if (isDirectory(candidate))
            return candidate;
    }
    // 2. workspaceRegistry: sessions attach to a workspace record; a subagent
    //    child inherits the parent's cwd through its header (handled above) and
    //    is usually absent from sessionIds, so registry matching is the
    //    fallback for top-level sessions the header does not cover.
    if (workspaceRegistry && typeof workspaceRegistry.list === "function" && agent?.id) {
        try {
            const workspaces = await workspaceRegistry.list();
            for (const workspace of workspaces) {
                if (Array.isArray(workspace.sessionIds)
                    && workspace.sessionIds.includes(agent.id)
                    && isDirectory(workspace.path)) {
                    return workspace.path;
                }
            }
        }
        catch {
            // registry unavailable — fall through to the error path
        }
    }
    return undefined;
}
// Hard dependencies: the loader must delay activation until every service the
// apply body reads is mounted. Without `inject`, a dependency-free row
// activates immediately — before subprocess/tools/systemPrompt exist — and the
// guard below silently returns, registering nothing.
// `connection` stays off this list. Headless DSH has no connection service, and
// a static inject would leave the adapter pending. Settings RPC is mounted
// after claw_run, through ctx.inject(["connection"]) on the root fiber.
export const inject = ["subprocess", "tools", "systemPrompt", "skills", "goals"];
export function createAgentGuidanceStore() {
    const values = new WeakMap();
    return {
        get: (scope) => scope ? values.get(scope) ?? "" : "",
        set: (agent, guidance) => values.set(agent, guidance),
    };
}
export function projectTodos(projection, output) {
    const planInput = projection?.input;
    const planTasks = Array.isArray(planInput?.plan)
        ? planInput.plan.map((step) => ({
            title: typeof step.step === "string" ? step.step : "",
            status: typeof step.status === "string" ? step.status : "",
        }))
        : undefined;
    const outputTasks = Array.isArray(output?.tasks)
        ? output.tasks
        : output?.planView?.tasks;
    // An explicit empty projection means clear the dock; only an absent
    // projection may fall back to compact output tasks.
    const tasks = planTasks ?? outputTasks;
    if (!Array.isArray(tasks))
        return undefined;
    return tasks
        .map((task) => {
        const title = typeof task.title === "string" ? task.title.trim() : "";
        const status = typeof task.status === "string" ? task.status : "";
        if (!title)
            return null;
        const todoStatus = status === "done" || status === "completed"
            ? "completed"
            : status === "in_progress" || status === "active"
                ? "in_progress"
                : "pending";
        return { content: title, status: todoStatus };
    })
        .filter((entry) => entry !== null);
}
// ── Cordis plugin ───────────────────────────────────────────────────────────
export function apply(ctx) {
    const c = ctx;
    const subprocess = c.get("subprocess");
    const tools = c.get("tools");
    const systemPrompt = c.get("systemPrompt");
    const goals = c.get("goals");
    if (subprocess === undefined || tools === undefined || systemPrompt === undefined)
        return;
    // workspaceRegistry is resolved lazily at execution time (c.get inside the
    // callbacks): it mounts later than subprocess/tools, so a snapshot taken
    // during apply may be undefined.
    const resolveRegistry = () => c.get("workspaceRegistry");
    // Complete skills are assembled at packaging time with every host route;
    // adapter-local payloads register into
    // the layered registry as a bundled source. Fail-open if the service is
    // absent or the provider errors.
    const skillsService = c.get("skills");
    if (skillsService !== undefined) {
        try {
            registerBundledSkills(skillsService);
        }
        catch {
            // fail-open
        }
    }
    // Match the CLI registry identity: an agent visiting a different workspace
    // must never reuse a transport fixed to its previous workdir.
    const sessionKey = (agentId, workdir) => `${process.platform === "win32" ? path.resolve(workdir).toLowerCase() : path.resolve(workdir)}\0${agentId}`;
    const SESSION_TRANSPORT_IDLE_MS = 10 * 60 * 1000;
    const sessions = new Map();
    const reclaiming = new Set();
    const release = (key, session, reason) => {
        if (sessions.get(key) !== session)
            return;
        sessions.delete(key);
        reclaiming.add(session);
        void session.close(reason).catch((error) => {
            console.warn(`[claw-kit] session transport close failed for ${session.status().workdir} ${session.status().sessionId}:`, error);
        }).finally(() => reclaiming.delete(session));
    };
    const guidanceByAgent = createAgentGuidanceStore();
    const finalizerAbort = new AbortController();
    systemPrompt.context({
        name: "claw:workflow", order: 60,
        // Prompt assembly is scoped by the calling agent. Keep each web thread's
        // workflow snapshot on that exact scope key so concurrent sessions cannot
        // overwrite one another with a global last-writer value.
        text: (context) => guidanceByAgent.get(context.scope) || renderGuidanceSnapshot(undefined),
    });
    systemPrompt.section({
        name: "tool:claw",
        order: 115,
        text: [
            "claw-kit workflow: load the `using-claw-kit` skill first whenever the adapter is enabled or its start prompt is present, then follow its claw_run execution route as the only next-step contract. The `claw_run` tool executes plan, task, subplan, and search operations; commandHints returned by claw_run map 1:1 to its arguments. The adapter consumes progress projection and goal sync automatically — do not call goal tools or maintain a parallel task list for claw plans.",
        ].join("\n"),
    });
    // Scan one-off CLI output for the first protocol JSON object.
    function parseProtocol(text) {
        for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
            let depth = 0;
            let quoted = false;
            let escaped = false;
            for (let i = start; i < text.length; i++) {
                const ch = text[i];
                if (quoted) {
                    if (escaped)
                        escaped = false;
                    else if (ch === "\\")
                        escaped = true;
                    else if (ch === '"')
                        quoted = false;
                }
                else if (ch === '"')
                    quoted = true;
                else if (ch === "{")
                    depth++;
                else if (ch === "}" && --depth === 0) {
                    try {
                        const parsed = JSON.parse(text.slice(start, i + 1));
                        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                            return parsed;
                    }
                    catch {
                        // unrelated braces
                    }
                    break;
                }
            }
        }
        return null;
    }
    async function runOneOff(argv, workdir, sessionId, stdinPayload) {
        // After the guard above, subprocess is always present; closure narrowing
        // is lost, so rebind it.
        const sp = subprocess;
        const { executable, args } = process.platform === "win32"
            ? { executable: process.execPath, args: [resolveCommandEntry(), ...argv] }
            : { executable: "claw", args: argv };
        const handle = sp.spawn({
            argv: [executable, ...args],
            cwd: workdir,
            env: { CLAW_SESSION_ID: sessionId },
            stdio: {
                stdin: stdinPayload === undefined ? "ignore" : "pipe",
                stdout: { mode: "collect", maxBytes: 262144, spill: { maxBytes: 1048576 } },
                stderr: { mode: "collect", maxBytes: 131072 },
            },
            graceMs: 10000,
        });
        if (stdinPayload !== undefined) {
            if (!handle.stdin) {
                terminateForCleanup(handle);
                throw new Error("DSH_REPORT_TRANSPORT_UNAVAILABLE: private CLI stdin is unavailable.");
            }
            handle.stdin.end(stdinPayload);
        }
        const outcome = await handle.done;
        const readOutput = (reader) => {
            const collected = reader?.readFrom?.(0);
            if (collected?.lossy)
                throw new Error("claw one-off output was truncated");
            return collected?.text ?? reader?.finalize().text ?? "";
        };
        const text = readOutput(handle.collected?.stdout);
        const errText = readOutput(handle.collected?.stderr);
        if ((outcome.exitCode ?? outcome.code) !== 0 || outcome.signal) {
            let diagnostic;
            try {
                diagnostic = JSON.parse(errText);
            }
            catch {
                diagnostic = new Error(errText ? errText.slice(-4096) : "CLI process exited without a diagnostic");
            }
            const failure = serializeFailure(diagnostic, { fallbackCode: "CLI_OWNER_FAILED", fallbackOutcome: "unknown", operation: argv[0], origin: "cli" });
            throw Object.assign(new Error(failure.message), failure);
        }
        return { text, errText };
    }
    function sessionFor(agentId, workdir) {
        const key = sessionKey(agentId, workdir);
        let session = sessions.get(key);
        if (!session) {
            session = new ClawSession(subprocess, workdir, agentId, "claw", 15000, SESSION_TRANSPORT_IDLE_MS, (idle) => release(key, idle, "idle-timeout"), (dead) => release(key, dead, "child-exit"));
            sessions.set(key, session);
        }
        return session;
    }
    const foreground = new RoleDelegation({
        getService: (name) => c.get(name), signal: finalizerAbort.signal,
        resolveParent: async (actor) => {
            const teams = c.get("agentTeams");
            const membership = teams?.tryMembership?.(actor);
            if (membership?.root && (membership.role === "lead" || membership.role === "teammate"))
                return membership.root;
            const parentId = actor.session?.header?.parentSession;
            if (!parentId)
                return actor;
            const registry = c.get("agents");
            const parent = registry?.get?.(parentId);
            if (!parent || parent.id !== parentId)
                throw new Error("DELEGATE_PARENT_UNAVAILABLE");
            const native = c.get("subagents");
            const children = await native?.listChildren?.(parentId);
            if (!Array.isArray(children)
                || children.some(child => child.kind === "diagnostic" && child.id === actor.id))
                throw new Error("DELEGATE_PARENT_UNAVAILABLE");
            return children.some(child => child.kind === "child" && child.id === actor.id) ? parent : actor;
        },
        readContext: async (actor) => {
            const workdir = await resolveWorkdir(actor, resolveRegistry());
            if (!workdir)
                throw new Error("DELEGATE_WORKSPACE_UNAVAILABLE");
            const response = await runOneOff(["context", "--host", "dsh"], workdir, actor.id);
            const context = parseProtocol(response.text);
            if (!context)
                throw new Error("DELEGATE_CONTEXT_UNAVAILABLE");
            return context;
        },
        registerReport: async (actor, expectedPlanPath, documentPath) => {
            const workdir = await resolveWorkdir(actor, resolveRegistry());
            if (!workdir)
                return { status: "deferred", reason: "WORKSPACE_UNAVAILABLE" };
            const samePath = (a, b) => process.platform === "win32"
                ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
            const inspect = async () => {
                const context = parseProtocol((await runOneOff(["context", "--host", "dsh"], workdir, actor.id)).text);
                return context?.activeWorkflow;
            };
            // The CLI's expectedPlanPath guard is the atomic authority. A separate
            // context read is only recovery evidence after an unknown response.
            const input = { ...daemonInput("plan.edit", { references: [{ path: documentPath, why: "Feature architecture design for the active task." }] }), expectedPlanPath };
            try {
                const response = await sessionFor(actor.id, workdir).request("plan.edit", input, 30000, (send) => routeCommand(send, () => runCommandBaseline(subprocess, workdir, actor.id, "plan.edit", input)));
                if (!response.ok)
                    return { status: "deferred", reason: response.error?.code ?? "REFERENCE_REGISTRATION_DEFERRED" };
                consumeHostActions(response.hostActions, goals, actor);
                const guidance = renderGuidanceSnapshot(response.output);
                if (guidance)
                    guidanceByAgent.set(actor, guidance);
                return { status: "registered" };
            }
            catch {
                // Read-only evidence may recover a lost append response; never replay an
                // unguarded mutation or switch the parent's current plan to register it.
                const recovered = await inspect().catch(() => undefined);
                return recovered?.planPath && samePath(recovered.planPath, expectedPlanPath)
                    && recovered.planContent?.references?.some(ref => ref.path === documentPath)
                    ? { status: "registered" } : { status: "deferred", reason: "REFERENCE_OUTCOME_UNKNOWN" };
            }
        },
    });
    async function readParentSessionEvents(parentId, code, missingCode = code) {
        let serviceObserved = false;
        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const query = c.get("sessionQuery");
                if (!query)
                    continue;
                serviceObserved = true;
                const snapshot = await query.readSession(parentId);
                if (Array.isArray(snapshot?.events))
                    return snapshot.events;
            }
            catch (error) {
                lastError = error;
            } // one read-only retry, never a report commit
        }
        const failure = serializeFailure(lastError, { fallbackCode: serviceObserved ? code : missingCode, operation: "parent.history.read", origin: "dsh", fallbackOutcome: "known" });
        throw Object.assign(new Error(failure.message), failure, { phase: failure.phase ?? "capture", outcome: failure.outcome ?? "known", effect: failure.effect ?? "none" });
    }
    const dispatchSource = createSourceFinalizerDispatcher({
        getService: name => c.get(name),
        selectModel: (agent, task) => selectDshRoleModel({ agent, role: "finalizer", supportsOptions: true,
            getService: name => name === "sessionQuery" ? undefined : c.get(name),
            hints: { model: task.model, reasoningEffort: task.reasoningEffort } }),
    });
    // Session-start: auto-claw equivalent — recover a bound plan and inject its
    // compact guidance snapshot. Fail-open.
    c.on("agent/session-start", (payload) => {
        const agent = payload?.agent;
        if (!agent?.id)
            return;
        void (async () => {
            try {
                const workdir = await resolveWorkdir(agent, resolveRegistry());
                if (workdir === undefined)
                    return;
                try {
                    const { text } = await runOneOff(["context", "--host", "dsh"], workdir, agent.id);
                    const parsed = parseProtocol(text);
                    const rendered = renderGuidanceSnapshot(parsed ?? undefined);
                    if (rendered)
                        guidanceByAgent.set(agent, rendered);
                }
                catch { /* Context is fail-open; old jobs are never automatically resumed. */ }
            }
            catch {
                // fail-open
            }
        })();
    });
    // Workers read source history on demand; parent dispatch does not certify materials.
    c.on("dispose", () => {
        finalizerAbort.abort();
        for (const [id, session] of sessions)
            release(id, session, "plugin-dispose");
    });
    tools.register({
        name: "claw_run",
        description: [
            "Run one claw-kit workflow operation in the current session through the claw session daemon. Operation names use dot form: context, plan.create, plan.start, plan.wait, plan.resume, plan.edit, plan.done, plan.show, task.add, task.edit, task.remove, task.done, subplan.create, knowledge.materials, search, search.index.refresh. `search.index.refresh` takes no arguments and refreshes only the calling session's project vector index. `context` restores the current host-scoped startup snapshot with no arguments. Other arguments use canonical snake_case: plan.create takes title, goal, knowledge_capture (optional boolean, defaults to the template setting or true; false disables knowledge accumulation); project setup is automatic and scope is not accepted; plan.start takes goal, requirements, questions, acceptance, rules, key_decisions, references, and add_tasks; plan.edit accepts the same plan fields plus summary, removal fields, retrospective fields, status, or an ordered canonical operations array; plan.resume takes optional plan_id; plan.done takes retrospective, key_decisions, what_worked, issues, and follow_ups; task.add takes title/detail or tasks; task.done takes id/choice or tasks; task.remove takes id or tasks to delete task items; knowledge.materials takes source_session_key and source_plan to read source evidence and generate ordinary writer templates; it does not claim work or register a completion. References are arrays of {path, why}.",
            "Semantic role work: delegate.start takes role (researcher or feature-architect), brief, and optional output (auto/reply/report); delegate.result takes assignment_id and optional wait_ms; assigned workers use delegate.complete with assignment_id, status (completed/failed), result or error, and optional document_path. The adapter selects Team/native, reuses members, queues and recovers assignments, and validates report registration. Do not manage underlying backend handles. Researcher never writes reports; architecture auto writes only when an active task exists.",
            "The adapter forges session identity and workspace from the calling agent — never pass session, host, or workdir arguments. Unsupported arguments for mapped operations fail immediately instead of being silently dropped. It auto-consumes CLI hostActions: plan progress projection and native DSH goal sync happen inside the tool, so do not call goal tools for claw plans. The result is a compact guidance snapshot; follow it as the only next-step contract.",
        ].join(" "),
        parameters: {
            type: "object",
            properties: {
                operation: { type: "string", description: "claw operation name, e.g. plan.create" },
                args: {
                    type: "object",
                    additionalProperties: true,
                    description: "operation arguments as a flat key-value map",
                },
            },
            required: ["operation"],
            additionalProperties: false,
        },
        output: {
            schema: { type: "object", additionalProperties: true },
            render(_args, value) {
                return [{ type: "text", text: JSON.stringify(value) }];
            },
        },
        async execute(args, exec) {
            const agent = exec?.agent;
            if (!agent?.id)
                throw new Error("claw_run requires a calling agent");
            const operation = String(args.operation ?? "");
            if (!operation)
                throw new Error("operation is required");
            const workdir = await resolveWorkdir(agent, resolveRegistry());
            if (workdir === undefined) {
                throw new Error("claw_run requires a valid session workspace; no workspace owns this session and agent.session.cwd resolved to none");
            }
            if (operation === "delegate.start")
                return foreground.start(agent, workdir, exec.callId ?? "", args.args ?? {});
            if (operation === "delegate.result")
                return foreground.result(agent, workdir, args.args ?? {}, exec.signal);
            if (operation === "delegate.complete")
                return foreground.complete(agent, workdir, args.args ?? {});
            const input = daemonInput(operation, (args.args ?? {}));
            if (operation === "context") {
                const { text } = await runOneOff(["context", "--host", "dsh"], workdir, agent.id);
                const context = parseProtocol(text);
                if (!context)
                    throw new Error("claw context returned no valid JSON protocol result");
                const rendered = renderGuidanceSnapshot(context);
                if (rendered)
                    guidanceByAgent.set(agent, rendered);
                return context;
            }
            const key = sessionKey(agent.id, workdir);
            let session = sessions.get(key);
            if (!session) {
                session = new ClawSession(subprocess, workdir, agent.id, "claw", 15000, SESSION_TRANSPORT_IDLE_MS, (idle) => release(key, idle, "idle-timeout"), (dead) => release(key, dead, "child-exit"), ["knowledge.done", "knowledge.done.receipt"].includes(operation));
                sessions.set(key, session);
            }
            let response;
            const timeoutMs = operation === "search.index.refresh" ? 300_000 : 30_000;
            const request = session.request(operation, input, timeoutMs, (send) => routeCommand(send, () => runCommandBaseline(subprocess, workdir, agent.id, operation, input, undefined, timeoutMs)));
            const requestOrdinal = session.status().requestsStarted;
            const recoverUnknown = async (primary) => {
                const diagnostics = [];
                try {
                    await session.close();
                }
                catch (error) {
                    diagnostics.push(error);
                }
                if (sessions.get(key) === session)
                    sessions.delete(key);
                throw unknownOperationError(operation, primary, diagnostics);
            };
            try {
                response = await request;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!isUnknownCommandOutcome(error) && !message.startsWith("CLAW_OUTCOME_UNKNOWN:"))
                    throw error;
                response = await recoverUnknown(error);
            }
            if (response.ok !== true && isUnknownCommandOutcome(response.error))
                response = await recoverUnknown(response.error);
            if (response.ok !== true) {
                if (response.error?.outcome === "known" && response.error.phase && response.error.effect) {
                    // Preserve owner evidence as tool data; an SDK may strip custom Error
                    // properties and leave the agent with unsafe text-only retry advice.
                    return { ok: false, command: response.command ?? operation, error: { ...response.error },
                        notes: response.error.effect === "none"
                            ? "The owner rejected this request before business writes. Correct the request using canonical context."
                            : "The operation has durable effects. Inspect canonical state; do not replay the mutation." };
                }
                throw operationFailureError(response.command ?? "unknown", response.error);
            }
            if (operation === "knowledge.materials" && response.output) {
                const material = response.output;
                try {
                    const source = input;
                    const history = await readParentSessionEvents(source.sourceSessionKey, "DSH_REPORT_HISTORY_UNAVAILABLE", "DSH_REPORT_HOST_UNAVAILABLE");
                    const rows = extractPlanConversation(history, source.sourceSessionKey, material.startedAt ? Date.parse(String(material.startedAt)) : undefined, material.endedAt ? Date.parse(String(material.endedAt)) : undefined);
                    fs.writeFileSync(String(material.reportPath), rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
                    response.output = { ...material, conversationStatus: "available", messageCount: rows.length };
                }
                catch (error) {
                    response.output = { ...material, conversationStatus: "unavailable", diagnostic: serializeFailure(error, { fallbackCode: "DSH_REPORT_HISTORY_UNAVAILABLE", operation: "knowledge.materials", origin: "dsh" }) };
                }
            }
            const { consumed, projection, failures } = consumeHostActions(response.hostActions, goals, exec.agent);
            const visible = compactClawOutput(response.output, operation);
            if (operation === "knowledge.claim" && response.output?.recovered === true)
                visible.recovered = true;
            if (consumed.length)
                visible.goalSync = consumed;
            if (projection !== undefined)
                visible.projection = projection.input;
            if (failures.length)
                visible.hostEffectFailures = failures;
            // Keep the injected [claw workflow] context current: every claw_run
            // returns the latest plan snapshot, so refresh lastGuidance instead of
            // leaving the session-start snapshot stale (progress otherwise freezes
            // at the first plan state seen this session). Fail-open.
            try {
                const rendered = renderGuidanceSnapshot(response.output);
                if (rendered)
                    guidanceByAgent.set(agent, rendered);
            }
            catch {
                // fail-open
            }
            // Drive the DSH-native todo dock (conversation.input.dock id=todo) from
            // the claw plan: map plan tasks to todo/write items so the UI shows the
            // plan's step progress bar. Whole-list replace, last-write-wins — the
            // same seam the model-facing todo_write tool uses. Fail-open.
            try {
                const agentWithSession = exec.agent;
                if (agentWithSession?.session && typeof agentWithSession.session.append === "function") {
                    // Prefer an update_plan projection, including an explicit empty plan
                    // used to clear the dock; only a missing projection falls back.
                    const todos = projectTodos(projection, response.output);
                    if (todos !== undefined) {
                        agentWithSession.session.append("todo/write", { todos });
                    }
                }
            }
            catch {
                // fail-open: todo sync must never break a settled mutation
            }
            if (response.knowledgeDispatch !== undefined) {
                const dispatch = response.knowledgeDispatch;
                visible.dispatch = await dispatchSource(agent, workdir, dispatch);
                visible.knowledgeDispatch = { schemaVersion: dispatch.schemaVersion ?? 1,
                    ...(dispatch.dispatchId ? { dispatchId: dispatch.dispatchId } : {}) };
            }
            // Move dispatch to the front so truncation cannot hide the dispatch
            // confirmation (large projections previously pushed it past the limit).
            // Only re-insert when a dispatch actually exists: assigning undefined
            // broke DSH's lossless-JSON tool-output validation (a plain plan.create
            // returned "value is not lossless JSON" once 0.2.26.0 loaded — learned
            // 2026-08-22).
            const dispatchValue = visible.dispatch;
            delete visible.dispatch;
            const reordered = {};
            for (const key of Object.keys(visible)) {
                reordered[key] = visible[key];
                if (key === "command" && dispatchValue !== undefined)
                    reordered.dispatch = dispatchValue;
            }
            // A completed plan has no reason to keep its stdio transport resident.
            // Dispatch/host effects above must finish first. A concurrent next-plan
            // request wins the lease and prevents us from closing its live transport.
            if (operation === "plan.done" && response.ok) {
                const state = session.status();
                if (state.queued === 0 && state.requestsStarted === requestOrdinal)
                    release(key, session, "plan.done");
            }
            return reordered;
        },
        presentCall: (callArgs) => ({
            card: "generic",
            title: "claw",
            kind: "other",
            rawInput: String(callArgs?.operation ?? ""),
        }),
    });
    // Settings uses a dedicated browser RPC channel. Its payload contains only a registry
    // workspace id and config operation fields: no browser-supplied filesystem paths.
    // Mounted after claw_run so a connection/webServer failure cannot skip the tool.
    // Headless profiles never invoke the callback. Web profiles register through the
    // root connection, because DSH 0.2's connection fiber cannot see webServer.
    try {
        mountConnectionRpcChannels(ctx, [
            {
                channel: "/claw-session-lifecycle",
                handler: async () => ({
                    ok: true,
                    value: {
                        schemaVersion: 1, idleTimeoutMs: SESSION_TRANSPORT_IDLE_MS,
                        sessions: [...new Set([...sessions.values(), ...reclaiming])].map((session) => session.status()),
                    },
                }),
            },
            {
                channel: "/claw-project-config",
                handler: async (endpoint, payload) => {
                    const registry = resolveRegistry();
                    if (!registry)
                        return {
                            ok: false,
                            error: { code: "WORKSPACE_REGISTRY_UNAVAILABLE", message: "DSH workspace registry is unavailable.", details: {} },
                        };
                    return handleProjectConfigRpc(endpoint, payload, registry, (argv, cwd) => runOneOff(argv, cwd, "dsh-project-config"));
                },
            },
        ]);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[claw-kit] settings RPC channel was not mounted: ${message}`);
    }
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map