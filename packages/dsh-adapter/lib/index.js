import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPlanFinalAnswers } from "./capture.js";
import { ClawSession } from "./claw-session.js";
import { compactClawOutput, consumeHostActions, } from "./host-actions.js";
import { daemonInput, renderGuidanceSnapshot } from "./protocol.js";
import { registerBundledSkills } from "./skills.js";
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
export const inject = ["subprocess", "tools", "systemPrompt", "skills", "goals"];
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
    // Bundled skills: shared-synced (planning/config/create-claw-skill/
    // claw-kit-doc) plus host-specific (using-claw-kit/researcher) register into
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
    const sessions = new Map();
    let lastGuidance = "";
    systemPrompt.context({
        name: "claw:workflow",
        order: 60,
        // Latest injected snapshot; empty text contributes nothing. Single-session
        // TUI is exact; concurrent web sessions converge on the last writer.
        text: () => lastGuidance,
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
    async function runOneOff(argv, workdir, sessionId) {
        // After the guard above, subprocess is always present; closure narrowing
        // is lost, so rebind it.
        const sp = subprocess;
        const { executable, args } = process.platform === "win32"
            ? { executable: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", "claw.cmd", ...argv] }
            : { executable: "claw", args: argv };
        const handle = sp.spawn({
            argv: [executable, ...args],
            cwd: workdir,
            env: { CLAW_SESSION_ID: sessionId },
            stdio: {
                stdin: "ignore",
                stdout: { mode: "collect", maxBytes: 262144, spill: { maxBytes: 1048576 } },
                stderr: { mode: "collect", maxBytes: 131072 },
            },
            graceMs: 10000,
        });
        await handle.done;
        return {
            text: handle.collected?.stdout?.finalize().text ?? "",
            errText: handle.collected?.stderr?.finalize().text ?? "",
        };
    }
    // Persist adapter-owned final events for the registered DSH report collector.
    function dshReportJournalDir() {
        const localAppData = process.env.LOCALAPPDATA
            ?? (process.platform === "win32"
                ? path.join(os.homedir(), "AppData", "Local")
                : path.join(os.homedir(), ".local", "share"));
        return process.env.CLAW_DSH_REPORT_JOURNAL_DIR ?? path.join(localAppData, "claw", "dsh-report-journal");
    }
    function writeDshReportJournal(sessionId, events) {
        const dir = dshReportJournalDir();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${sessionId}.json`), JSON.stringify({ sessionId, events: extractPlanFinalAnswers(events, sessionId) }, null, 2), "utf8");
    }
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
                await runOneOff([
                    "internal-report-collector-register", "--project-root", workdir, "--collector-host", "dsh",
                    "--executable", process.execPath,
                    "--arg", path.join(path.dirname(fileURLToPath(import.meta.url)), "report-collector-cli.js"),
                ], workdir, agent.id);
                const { text } = await runOneOff(["context", "--host", "dsh"], workdir, agent.id);
                const parsed = parseProtocol(text);
                const rendered = renderGuidanceSnapshot(parsed ?? undefined);
                if (rendered)
                    lastGuidance = rendered;
            }
            catch {
                // fail-open
            }
        })();
    });
    // No turn-stopping hook: terminal plan mutation snapshots the adapter-owned
    // journal, and the unified claim flow invokes the registered collector.
    c.on("dispose", () => {
        for (const session of sessions.values())
            void session.close();
        sessions.clear();
    });
    tools.register({
        name: "claw_run",
        description: [
            "Run one claw-kit workflow operation in the current session through the claw session daemon. Operation names use dot form: plan.create, plan.start, plan.wait, plan.resume, plan.edit, plan.done, plan.show, task.add, task.edit, task.done, subplan.create, search. Arguments are the operation's canonical fields (snake_case): e.g. plan.create takes title, goal, scope; plan.start takes requirements, acceptance (array), add_tasks (array of {title, detail}); task.done takes id or tasks (array of {id}).",
            "The adapter forges session identity and workspace from the calling agent — never pass session, host, or workdir arguments. It auto-consumes CLI hostActions: plan progress projection and native DSH goal sync happen inside the tool, so do not call goal tools for claw plans. The result is a compact guidance snapshot; follow it as the only next-step contract.",
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
            let session = sessions.get(agent.id);
            if (!session) {
                session = new ClawSession(subprocess, workdir, agent.id);
                sessions.set(agent.id, session);
            }
            const input = daemonInput(operation, (args.args ?? {}));
            let response;
            let retried = false;
            try {
                response = await session.request(operation, input);
            }
            catch (error) {
                // Connection-level failure (stale daemon, killed child, closed pipe):
                // rebuild the session once and retry the same operation.
                const message = error instanceof Error ? error.message : String(error);
                if (!/SESSION_CONNECTION_LOST|CLAW_SESSION_TIMEOUT|CLAW_SESSION_OPEN_TIMEOUT/.test(message))
                    throw error;
                // Close the stale connection first so the daemon releases the session
                // slot; otherwise the fresh open hits SESSION_BUSY and hangs.
                try {
                    await session.close();
                }
                catch { /* best-effort */ }
                sessions.delete(agent.id);
                const fresh = new ClawSession(subprocess, workdir, agent.id);
                sessions.set(agent.id, fresh);
                response = await fresh.request(operation, input);
            }
            if (response.ok !== true) {
                // A stale daemon connection can surface as a business error instead of
                // a protocol rejection; rebuild once and retry before failing.
                const message = response.error?.message ?? "";
                if (/connection was interrupted|session connection/i.test(message) && retried === false) {
                    retried = true;
                    try {
                        await session.close();
                    }
                    catch { /* best-effort */ }
                    sessions.delete(agent.id);
                    const fresh = new ClawSession(subprocess, workdir, agent.id);
                    sessions.set(agent.id, fresh);
                    response = await fresh.request(operation, input);
                }
            }
            if (response.ok !== true) {
                throw new Error(`claw operation failed: ${response.command ?? "unknown"} — ${response.error?.message ?? "no detail"}`);
            }
            const { consumed, projection } = consumeHostActions(response.hostActions, goals, exec.agent);
            const visible = compactClawOutput(response.output);
            if (consumed.length)
                visible.goalSync = consumed;
            if (projection !== undefined)
                visible.projection = projection.input;
            // Keep the injected [claw workflow] context current: every claw_run
            // returns the latest plan snapshot, so refresh lastGuidance instead of
            // leaving the session-start snapshot stale (progress otherwise freezes
            // at the first plan state seen this session). Fail-open.
            try {
                const rendered = renderGuidanceSnapshot(response.output);
                if (rendered)
                    lastGuidance = rendered;
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
                    // Prefer the update_plan hostAction's full plan document (present on
                    // every plan mutation, including task.done); fall back to the compact
                    // output's tasks array (plan.show --simple carries {status,goal,tasks}).
                    const planInput = projection?.input;
                    const planTasks = Array.isArray(planInput?.plan)
                        ? planInput.plan.map((step) => ({
                            title: typeof step.step === "string" ? step.step : "",
                            status: typeof step.status === "string" ? step.status : "",
                        }))
                        : undefined;
                    const output = response.output;
                    const outputTasks = Array.isArray(output?.tasks)
                        ? output.tasks
                        : output?.planView?.tasks;
                    const tasks = planTasks && planTasks.length > 0 ? planTasks : outputTasks;
                    if (Array.isArray(tasks)) {
                        const todos = tasks
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
                        // Whole-list replace, last-write-wins: an empty task list (plan
                        // completed/closed) must CLEAR the dock — writing only when
                        // todos.length > 0 left stale entries after plan.done
                        // (learned 2026-08-22).
                        agentWithSession.session.append("todo/write", { todos });
                    }
                }
            }
            catch {
                // fail-open: todo sync must never break a settled mutation
            }
            // Knowledge closeout: the daemon returns a knowledgeDispatch on the
            // response envelope for a terminal plan transition. DSH has a native
            // subagent, so BOTH `subagent` and `background` policies run through one
            // flow — the adapter starts a one-shot subagent with the dispatch's
            // self-contained prompt, and the model never touches the writer.
            // NOTE: `dispatch` is surfaced FIRST (right after ok/command) so a
            // large projection or dispatch prompt can never push the dispatch
            // confirmation past a tool-result truncation (observed: dispatch was
            // cut at ~1200 chars, which made the auto-dispatch look like it failed).
            if (response.knowledgeDispatch !== undefined) {
                // Deterministic report capture: snapshot adapter-owned final events
                // before dispatch. The unified claim flow reads them through this
                // adapter's registered collector. Fail-open.
                try {
                    const sessionQuery = c.get("sessionQuery");
                    if (sessionQuery) {
                        const snapshot = await sessionQuery.readSession(agent.id);
                        writeDshReportJournal(agent.id, (snapshot?.events ?? []));
                    }
                }
                catch {
                    // fail-open
                }
                const dispatch = response.knowledgeDispatch;
                const subagents = c.get("subagents");
                if (subagents && dispatch && typeof dispatch.prompt === "string" && dispatch.prompt.length > 0) {
                    try {
                        // Fire-and-forget dispatch: the finalizer only needs an execution
                        // receipt, it never replies. Pass a DEDICATED controller instead of
                        // exec.signal — the tool's signal aborts when this claw_run call
                        // returns, which cancelled the child before its first turn
                        // (learned 2026-08-22: plan.done auto-dispatch created the
                        // subagent session but the finalizer never ran). The dedicated
                        // controller keeps the child alive after the tool result is
                        // delivered; disposal is still driven by the run's own lifecycle.
                        const controller = new AbortController();
                        const run = await subagents.start("spawn", {
                            label: `knowledge-finalizer-${String(dispatch.finalizeId ?? "").slice(0, 12)}`,
                            prompt: [{ type: "text", text: dispatch.prompt }],
                            parent: exec.agent,
                            signal: controller.signal,
                        });
                        if (run.dispose) {
                            // Keep a settled run's resources released without awaiting it:
                            // the writer is independent of this tool result.
                            void Promise.resolve(run.result).finally(() => run.dispose()).catch(() => undefined);
                        }
                        visible.dispatch = { ok: true, runId: String(run.id), policy: dispatch.policy ?? "subagent" };
                    }
                    catch (error) {
                        // fail-open: surface the dispatch for the model to retry manually
                        visible.dispatch = {
                            ok: false,
                            reason: error instanceof Error ? error.message : String(error),
                        };
                    }
                }
                else if (subagents === undefined) {
                    visible.dispatch = { ok: false, reason: "subagents service unavailable" };
                }
                // Keep only a compact dispatch summary in the model-visible output:
                // the full writer prompt is consumed by the subagent, and a huge
                // prompt was pushing `dispatch` past truncation. Never expose prompt.
                visible.knowledgeDispatch = {
                    schemaVersion: 1,
                    policy: dispatch?.policy ?? "subagent",
                    finalizeId: dispatch?.finalizeId,
                };
            }
            // Move dispatch to the front so truncation cannot hide the dispatch
            // confirmation (large projections previously pushed it past the limit).
            const dispatchValue = visible.dispatch;
            delete visible.dispatch;
            const reordered = {};
            for (const key of Object.keys(visible)) {
                reordered[key] = visible[key];
                if (key === "command")
                    reordered.dispatch = dispatchValue;
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
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map