import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDshDelegationCapability } from "./team-capability.js";
import { DelegationReceiptStore } from "./delegation-receipts.js";
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : undefined;
const string = (v) => typeof v === "string" && v.length > 0 ? v : undefined;
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const text = (v) => [{ type: "text", text: v }];
const terminal = (r) => r.status === "completed" || r.status === "failed";
const normalize = (v) => process.platform === "win32" ? path.resolve(v).toLowerCase() : path.resolve(v);
const json = (v) => JSON.parse(JSON.stringify(v));
class DelegationError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
function reject(code) { throw new DelegationError(code); }
function failure(error) { return { ok: false, code: error instanceof DelegationError ? error.code : "DELEGATE_OPERATION_FAILED" }; }
function args(value, keys) {
    const v = object(value);
    if (!v || Object.keys(v).some((key) => !keys.includes(key)))
        reject("DELEGATE_INVALID_ARGUMENTS");
    return v;
}
function required(v, max) {
    if (typeof v !== "string" || !v.trim() || v.length > max)
        reject("DELEGATE_INVALID_ARGUMENTS");
    return v;
}
function assignmentId(v) {
    if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
        reject("DELEGATE_INVALID_ASSIGNMENT_ID");
    return v;
}
export function delegationAssignmentId(parentId, workdir, callId) {
    return hash(["claw-delegation-v1", parentId, normalize(workdir), callId]);
}
function parseReceipt(value, parent, workdir) {
    const r = object(value);
    if (!r || r.version !== 1 || typeof r.id !== "string" || !/^[a-f0-9]{64}$/.test(r.id) || r.parentId !== parent.id || r.workdir !== workdir ||
        !["researcher", "feature-architect"].includes(String(r.role)) || !["reply", "report"].includes(String(r.output)) ||
        !["team", "native-continuable", "native-one-shot"].includes(String(r.backend)) ||
        !["pending", "running", "unknown", "completed", "failed"].includes(String(r.status)) ||
        !["reserved", "attempted", "accepted", "unknown"].includes(String(r.delivery)) || !string(r.callId) || !string(r.requestHash) || !string(r.label) || !string(r.skillPath) || !string(r.fingerprint) || !string(r.brief) || !Number.isSafeInteger(r.ordinal) || Number(r.ordinal) < 1 || typeof r.admitted !== "boolean" ||
        (r.status === "completed" && !string(r.result)) || (r.status === "failed" && !string(r.error)) ||
        (r.output === "report" && (r.role !== "feature-architect" || !string(r.planPath) || !string(r.taskDir) || !string(r.reportDir) || !string(r.reportPath))))
        reject("DELEGATE_RECEIPT_INVALID");
    return r;
}
function nativeRoleId(parentId, fingerprint) {
    const s = hash([parentId, fingerprint]);
    return s.slice(0, 8) + "-" + s.slice(8, 12) + "-5" + s.slice(13, 16) + "-a" + s.slice(17, 20) + "-" + s.slice(20, 32);
}
/** Narrow foreground role owner. Receipts are operational, not a second claw plan. */
export class RoleDelegation {
    deps;
    store;
    waiters = new Map();
    registrations = new Map();
    admissions = new Map();
    advances = new Map();
    signal;
    constructor(deps) {
        this.deps = deps;
        this.signal = deps.signal ?? new AbortController().signal;
    }
    receipts() { return this.store ??= this.deps.receipts ?? new DelegationReceiptStore(); }
    async scope(actor, workdir, parentOnly) {
        if (!actor || !string(actor.id) || !path.isAbsolute(workdir))
            reject("DELEGATE_ACTOR_INVALID");
        const parent = await this.deps.resolveParent(actor);
        if (!parent || !string(parent.id) || (parentOnly && parent !== actor))
            reject("DELEGATE_PARENT_REQUIRED");
        if (!parentOnly && (parent === actor || actor.session?.header?.parentSession !== parent.id))
            reject("DELEGATE_WORKER_REQUIRED");
        const canonical = normalize(await fs.realpath(workdir));
        if (parent.session?.header?.cwd && normalize(await fs.realpath(parent.session.header.cwd)) !== canonical)
            reject("DELEGATE_WORKSPACE_MISMATCH");
        return { parent, workdir: canonical };
    }
    async read(parent, workdir, id) {
        return this.receipts().withParent(parent.id, workdir, async (tx) => {
            const value = await tx.get(id);
            if (!value)
                reject("DELEGATE_ASSIGNMENT_NOT_FOUND");
            const receipt = parseReceipt(value, parent, workdir);
            if (receipt.id !== id)
                reject("DELEGATE_RECEIPT_INVALID");
            return receipt;
        });
    }
    async update(parent, workdir, id, edit) {
        return this.receipts().withParent(parent.id, workdir, async (tx) => {
            const r = parseReceipt(await tx.get(id), parent, workdir);
            if (r.id !== id)
                reject("DELEGATE_RECEIPT_INVALID");
            const next = edit(r);
            await tx.put(id, json(next));
            return next;
        });
    }
    view(r) {
        return json({ ok: true, assignment_id: r.id, status: r.status, role: r.role, output: r.output,
            ...(r.result !== undefined ? { result: r.result } : {}), ...(r.error ? { error: r.error } : {}),
            ...(r.status === "completed" && r.output === "report" ? { document_path: r.reportPath, registration: r.registration ?? "pending" } : {}) });
    }
    notify(id) { for (const wake of this.waiters.get(id) ?? [])
        wake(); }
    async capability(parent) {
        return resolveDshDelegationCapability({ getService: this.deps.getService, agent: parent, role: "managed", provider: "spawn" });
    }
    async fresh(parent, r) {
        this.signal.throwIfAborted();
        const c = await this.capability(parent);
        if (!c.ready || (r.backend === "team" ? c.selectedRoute !== "team" || c.teamId !== r.teamId : c.selectedRoute !== "native") ||
            (r.backend !== "native-one-shot" && !c.reusable))
            reject("DELEGATE_CAPABILITY_CHANGED");
    }
    async start(actor, workdir, callId, raw) {
        try {
            const a = args(raw, ["role", "brief", "output"]);
            if (a.role !== "researcher" && a.role !== "feature-architect")
                reject("DELEGATE_ROLE_INVALID");
            const role = a.role;
            const brief = required(a.brief, 24000);
            const requested = a.output ?? "auto";
            if (!["auto", "reply", "report"].includes(String(requested)))
                reject("DELEGATE_OUTPUT_INVALID");
            if (role === "researcher" && requested === "report")
                reject("DELEGATE_RESEARCHER_REPLY_ONLY");
            required(callId, 512);
            const scope = await this.scope(actor, workdir, true);
            const parent = scope.parent;
            workdir = scope.workdir;
            const id = delegationAssignmentId(parent.id, workdir, callId);
            const requestHash = hash([role, brief, requested]);
            const prior = await this.receipts().withParent(parent.id, workdir, async (tx) => tx.get(id));
            if (prior) {
                const r = parseReceipt(prior, parent, workdir);
                if (r.id !== id)
                    reject("DELEGATE_RECEIPT_INVALID");
                if (r.requestHash !== requestHash)
                    reject("DELEGATE_CALL_ID_CONFLICT");
                if (!terminal(r))
                    await this.advance(parent, workdir);
                return this.view(await this.read(parent, workdir, id));
            }
            const capability = await this.capability(parent);
            if (!capability.ready)
                reject(capability.reason ?? "DELEGATE_CAPABILITY_UNAVAILABLE");
            const context = await this.deps.readContext(parent);
            const planPath = context.activeWorkflow?.planPath;
            const output = role === "researcher" || requested === "reply" ? "reply" : planPath ? "report" : "reply";
            if (requested === "report" && !planPath)
                reject("DELEGATE_REPORT_REQUIRES_ACTIVE_PLAN");
            const skill = role === "feature-architect" ? "feature-architecture" : "researcher";
            const skillRoot = this.deps.skillRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");
            const skillPath = path.resolve(skillRoot, skill, "SKILL.md");
            try {
                if (!(await fs.stat(skillPath)).isFile() || normalize(await fs.realpath(skillPath)) !== normalize(skillPath))
                    reject("DELEGATE_SKILL_RESOURCE_INVALID");
            }
            catch {
                reject("DELEGATE_SKILL_RESOURCE_UNAVAILABLE");
            }
            const fingerprint = hash([parent.id, workdir, role, "spawn", parent.options ?? {}]);
            const backend = capability.selectedRoute === "team" ? "team" : capability.reusable ? "native-continuable" : "native-one-shot";
            let report = {};
            if (output === "report") {
                if (!planPath || !path.isAbsolute(planPath) || !(await fs.stat(planPath)).isFile())
                    reject("DELEGATE_PLAN_PATH_INVALID");
                const capturedPlan = await fs.realpath(planPath);
                const taskDir = path.dirname(capturedPlan);
                const reportDir = path.join(taskDir, "feature-architecture");
                const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
                const summary = [...brief.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-")].slice(0, 32).join("").replace(/^-+|-+$/g, "") || "feature-architecture";
                report = { planPath: capturedPlan, taskDir, reportDir, reportPath: path.join(reportDir, stamp + "-" + summary + "-" + id + ".md") };
            }
            const initial = { version: 1, id, parentId: parent.id, workdir, callId, requestHash, role, brief, output, skillPath, fingerprint, backend,
                ...(capability.teamId ? { teamId: capability.teamId } : {}), label: backend === "native-one-shot" ? "claw-kit:delegate-once:" + id : "claw-kit:delegate:" + role + ":" + fingerprint,
                status: "pending", delivery: "reserved", ordinal: 1, admitted: false, ...report };
            const reserved = await this.receipts().withParent(parent.id, workdir, async (tx) => {
                const existing = await tx.get(id);
                if (existing) {
                    const receipt = parseReceipt(existing, parent, workdir);
                    if (receipt.id !== id)
                        reject("DELEGATE_RECEIPT_INVALID");
                    if (receipt.requestHash !== requestHash)
                        reject("DELEGATE_CALL_ID_CONFLICT");
                    return { receipt, created: false };
                }
                const rows = (await tx.list()).map((value) => parseReceipt(value, parent, workdir));
                const pending = rows.filter((receipt) => receipt.role === role && !terminal(receipt));
                if (pending.length >= 32)
                    reject("DELEGATE_PENDING_LIMIT");
                initial.ordinal = rows.reduce((maximum, receipt) => Math.max(maximum, receipt.ordinal), 0) + 1;
                initial.admitted = pending.length === 0;
                await tx.put(id, json(initial));
                return { receipt: initial, created: true };
            });
            if (!reserved.receipt)
                reject("DELEGATE_RECEIPT_INVALID");
            if (!reserved.created || !reserved.receipt.admitted) {
                void this.advance(parent, workdir).catch(() => undefined);
                return this.view(reserved.receipt);
            }
            return this.view(await this.runAdmitted(parent, reserved.receipt));
        }
        catch (error) {
            return failure(error);
        }
    }
    async runAdmitted(parent, receipt) {
        const existing = this.admissions.get(receipt.id);
        if (existing)
            return existing;
        const run = (async () => {
            let execute = false;
            const r = await this.update(parent, receipt.workdir, receipt.id, (r) => {
                if (!r.admitted || r.started || terminal(r))
                    return r;
                execute = true;
                return { ...r, started: true };
            });
            if (!execute)
                return r;
            try {
                if (r.reportDir) {
                    await fs.mkdir(r.reportDir, { recursive: true });
                    if (normalize(await fs.realpath(r.reportDir)) !== normalize(r.reportDir))
                        reject("DELEGATE_REPORT_PATH_INVALID");
                }
                await this.dispatch(parent, r);
                return await this.read(parent, r.workdir, r.id);
            }
            catch (error) {
                const final = await this.update(parent, r.workdir, r.id, (current) => terminal(current) ? current : { ...current,
                    status: current.memberAttempted || current.delivery !== "reserved" ? "unknown" : "failed",
                    error: error instanceof DelegationError ? error.code : "DELEGATE_DISPATCH_UNKNOWN" });
                this.notify(r.id);
                return final;
            }
        })();
        this.admissions.set(receipt.id, run);
        try {
            return await run;
        }
        finally {
            if (this.admissions.get(receipt.id) === run)
                this.admissions.delete(receipt.id);
        }
    }
    async advance(parent, workdir) {
        const key = parent.id + ":" + workdir;
        const prior = this.advances.get(key);
        if (prior)
            return prior;
        let again = false;
        const run = (async () => {
            const selected = await this.receipts().withParent(parent.id, workdir, async (tx) => {
                const rows = (await tx.list()).map((value) => parseReceipt(value, parent, workdir)).sort((a, b) => a.ordinal - b.ordinal);
                const candidates = [];
                for (const role of ["researcher", "feature-architect"]) {
                    const pending = rows.filter((r) => r.role === role && !terminal(r));
                    const active = pending.find((r) => r.admitted);
                    if (active) {
                        if (!active.started)
                            candidates.push(active);
                        else if (active.delivery !== "accepted" && active.status !== "unknown" && !this.admissions.has(active.id)) {
                            await tx.put(active.id, json({ ...active, status: "unknown", error: "DELEGATE_ADMISSION_UNKNOWN" }));
                        }
                        continue;
                    }
                    const first = pending[0];
                    if (first) {
                        const admitted = { ...first, admitted: true };
                        await tx.put(first.id, json(admitted));
                        candidates.push(admitted);
                    }
                }
                return candidates;
            });
            // The receipt lock has been released before starting any host operation.
            const outcomes = await Promise.all(selected.map((r) => this.runAdmitted(parent, r)));
            again = outcomes.some(terminal);
        })();
        this.advances.set(key, run);
        try {
            await run;
        }
        finally {
            if (this.advances.get(key) === run)
                this.advances.delete(key);
        }
        if (again)
            void this.advance(parent, workdir).catch(() => undefined);
    }
    bootstrap(r) {
        return "You are claw-kit role " + r.role + ". This only initializes your reusable role. Do not investigate, write, delegate, call any plan lifecycle or complete an assignment yet. Wait for the adapter assignment. Reply ready, then stop.";
    }
    prompt(r) {
        return "claw-role-assignment:v1:" + r.id + "\nYou are the assigned " + r.role + ". Execute directly; never delegate again or change parent claw lifecycle.\n" +
            "For each new assignment, re-read the relevant current sources; prior role memory and old results are not current evidence.\n" +
            "Load the assigned skill via the current skill tool or read this exact installed path: " + r.skillPath + ". Do not prefer a repository copy.\n" +
            "Workspace: " + r.workdir + "\nAssignment: " + r.brief + "\n" +
            (r.output === "reply" ? "All source and artifacts are read-only. Do not create any files. Return compact evidence and uncertainty.\n" :
                "Sources are read-only. taskDir=" + r.taskDir + "; reportDir=" + r.reportDir + "; the ONLY permitted file write is " + r.reportPath + ". Use that filename stem as the report heading.\n") +
            "Finish by calling claw_run operation delegate.complete with args " + JSON.stringify({ assignment_id: r.id, status: "completed", result: "<compact result>", ...(r.output === "report" ? { document_path: r.reportPath } : {}) }) + ". Use status failed and error for a genuine execution failure. " +
            "Role-level ready/answered/unresolved is content inside result, not the completion status. The adapter owns parent notification and plan-reference registration; do not send a separate peer message or manage Team tasks. End after completion.";
    }
    async dispatch(parent, r) {
        await this.fresh(parent, r);
        const native = this.deps.getService("subagents");
        if (r.backend === "native-one-shot") {
            if (typeof native?.listChildren !== "function")
                reject("DELEGATE_NATIVE_CATALOG_UNAVAILABLE");
            await this.update(parent, r.workdir, r.id, (v) => ({ ...v, delivery: "attempted" }));
            await this.fresh(parent, r);
            const run = await native.start("spawn", { parent, label: r.label, prompt: text(this.prompt(r)), signal: this.signal });
            await this.update(parent, r.workdir, r.id, (v) => ({ ...v, delivery: "accepted", ...(string(run?.id) ? { runId: run.id } : {}), status: terminal(v) ? v.status : "running" }));
            if (run?.result && typeof run.result.then === "function") {
                const settled = async () => {
                    await this.update(parent, r.workdir, r.id, (v) => terminal(v) ? v : { ...v, status: "failed", error: "DELEGATE_WORKER_ENDED_WITHOUT_COMPLETE" });
                    this.notify(r.id);
                    void this.advance(parent, r.workdir).catch(() => undefined);
                };
                void Promise.resolve(run.result).then(settled, settled).finally(() => run.dispose?.()).catch(() => undefined);
            }
            return;
        }
        let memberId;
        let memberName;
        if (r.backend === "team") {
            const team = this.deps.getService("agentTeams");
            const name = "claw-" + r.role;
            const rows = await team.listMembers(parent);
            if (!Array.isArray(rows))
                reject("DELEGATE_TEAM_ROSTER_UNAVAILABLE");
            const matches = rows.filter((m) => m.name === name);
            if (matches.length > 1)
                reject("DELEGATE_ROLE_AMBIGUOUS");
            let member = matches[0];
            if (member && (member.description !== r.label || member.role !== "teammate" || member.provider !== "spawn" || member.context !== "fresh" || !["running", "inactive"].includes(member.status) || member.diagnostics?.length))
                reject("DELEGATE_ROLE_INCOMPATIBLE");
            if (!member) {
                await this.update(parent, r.workdir, r.id, (v) => ({ ...v, memberAttempted: true }));
                await this.fresh(parent, r);
                const created = await team.spawnTeammate(parent, { name, description: r.label, prompt: text(this.bootstrap(r)), context: "fresh", provider: "spawn", signal: this.signal });
                member = created?.member;
            }
            if (!string(member?.id) || member.name !== name || member.status === "failed")
                reject("DELEGATE_MEMBER_CREATION_UNCERTAIN");
            memberId = member.id;
            memberName = member.name;
        }
        else {
            if (typeof native?.listChildren !== "function")
                reject("DELEGATE_NATIVE_CATALOG_UNAVAILABLE");
            const id = nativeRoleId(parent.id, r.fingerprint);
            const rows = await native.listChildren(parent.id);
            if (!Array.isArray(rows) || rows.some((m) => m.kind === "diagnostic"))
                reject("DELEGATE_NATIVE_CATALOG_UNAVAILABLE");
            const matches = rows.filter((m) => m.kind === "child" && (m.id === id || m.label === r.label));
            if (matches.length > 1)
                reject("DELEGATE_ROLE_AMBIGUOUS");
            const member = matches[0];
            if (member && (member.id !== id || member.label !== r.label || member.provider !== "spawn" || member.mode !== "continuable" || !["running", "inactive"].includes(member.activity)))
                reject("DELEGATE_ROLE_INCOMPATIBLE");
            if (!member) {
                await this.update(parent, r.workdir, r.id, (v) => ({ ...v, memberAttempted: true }));
                await this.fresh(parent, r);
                const created = await native.startContinuable({ childId: id, provider: "spawn", label: r.label, request: { parent, prompt: text(this.bootstrap(r)) }, signal: this.signal });
                if (created?.childId !== id)
                    reject("DELEGATE_MEMBER_CREATION_UNCERTAIN");
            }
            memberId = id;
        }
        await this.update(parent, r.workdir, r.id, (v) => ({ ...v, memberId, ...(memberName ? { memberName } : {}), delivery: "attempted" }));
        await this.fresh(parent, r);
        const receipt = r.backend === "team"
            ? (await this.deps.getService("agentTeams").sendMessage(parent, { target: memberName, content: text(this.prompt(r)), signal: this.signal }))?.messageId
            : await native.sendMessage(parent, memberId, text(this.prompt(r)), { signal: this.signal });
        if (!string(receipt))
            reject("DELEGATE_DELIVERY_UNCERTAIN");
        await this.update(parent, r.workdir, r.id, (v) => ({ ...v, messageId: receipt, delivery: "accepted", status: terminal(v) ? v.status : "running" }));
    }
    async proveWorker(parent, actor, r) {
        if (r.delivery === "reserved")
            reject("DELEGATE_NOT_DELIVERED");
        if (r.backend === "team") {
            const team = this.deps.getService("agentTeams");
            const membership = team?.tryMembership?.(actor);
            if (r.memberId !== actor.id || membership?.root !== parent || membership?.id !== r.teamId || membership?.role !== "teammate")
                reject("DELEGATE_FOREIGN_WORKER");
            return;
        }
        const native = this.deps.getService("subagents");
        if (typeof native?.listChildren !== "function")
            reject("DELEGATE_NATIVE_CATALOG_UNAVAILABLE");
        const rows = await native.listChildren(parent.id);
        if (!Array.isArray(rows) || rows.some((m) => m.kind === "diagnostic"))
            reject("DELEGATE_NATIVE_CATALOG_UNAVAILABLE");
        const matching = rows.filter((m) => m.kind === "child" && m.id === actor.id && m.label === r.label && m.provider === "spawn" && m.mode === (r.backend === "native-one-shot" ? "one-shot" : "continuable"));
        if (matching.length !== 1 || (r.memberId && r.memberId !== actor.id))
            reject("DELEGATE_FOREIGN_WORKER");
    }
    async validateReport(r, documentPath) {
        if (!string(documentPath) || !r.reportPath || !r.reportDir || !r.taskDir || normalize(path.resolve(r.workdir, documentPath)) !== normalize(r.reportPath))
            reject("DELEGATE_REPORT_PATH_INVALID");
        if (!(await fs.lstat(r.reportPath)).isFile() || normalize(await fs.realpath(r.reportPath)) !== normalize(r.reportPath) || normalize(await fs.realpath(r.reportDir)) !== normalize(r.reportDir))
            reject("DELEGATE_REPORT_PATH_INVALID");
    }
    async complete(actor, workdir, raw) {
        try {
            const a = args(raw, ["assignment_id", "status", "result", "document_path", "error"]);
            const id = assignmentId(a.assignment_id);
            if (a.status !== "completed" && a.status !== "failed")
                reject("DELEGATE_COMPLETION_STATUS_INVALID");
            if (a.status === "completed") {
                required(a.result, 64000);
                if (a.error !== undefined)
                    reject("DELEGATE_INVALID_ARGUMENTS");
            }
            else
                required(a.error, 8000);
            const scope = await this.scope(actor, workdir, false);
            const r = await this.read(scope.parent, scope.workdir, id);
            await this.proveWorker(scope.parent, actor, r);
            if (r.output === "reply" && a.document_path !== undefined)
                reject("DELEGATE_REPLY_FORBIDS_FILES");
            if (r.output === "report" && a.status === "completed")
                await this.validateReport(r, a.document_path);
            if (a.status === "failed" && (a.result !== undefined || a.document_path !== undefined))
                reject("DELEGATE_INVALID_ARGUMENTS");
            const completed = await this.update(scope.parent, scope.workdir, id, (current) => {
                if (terminal(current)) {
                    if (current.status !== a.status || current.result !== a.result || current.error !== a.error)
                        reject("DELEGATE_COMPLETION_CONFLICT");
                    return current;
                }
                const next = { ...current, memberId: actor.id, status: a.status,
                    ...(a.status === "completed" ? { result: a.result, ...(r.output === "report" ? { registration: "pending" } : {}) } : { error: a.error }) };
                if (a.status === "completed")
                    delete next.error;
                return next;
            });
            this.notify(id);
            void this.advance(scope.parent, scope.workdir).catch(() => undefined);
            return this.view(completed);
        }
        catch (error) {
            return failure(error);
        }
    }
    async register(parent, r) {
        if (r.status !== "completed" || r.output !== "report" || r.registration === "registered")
            return r;
        const prior = this.registrations.get(r.id);
        if (prior)
            return prior;
        const run = (async () => {
            await this.validateReport(r, r.reportPath);
            const context = await this.deps.readContext(parent);
            if (!context.activeWorkflow?.planPath || normalize(context.activeWorkflow.planPath) !== normalize(r.planPath)) {
                return this.update(parent, r.workdir, r.id, (v) => ({ ...v, registration: "deferred" }));
            }
            const outcome = await this.deps.registerReport(parent, r.planPath, r.reportPath);
            if (outcome.status !== "registered" && outcome.status !== "deferred")
                reject("DELEGATE_REGISTRATION_INVALID");
            return this.update(parent, r.workdir, r.id, (v) => ({ ...v, registration: outcome.status }));
        })();
        this.registrations.set(r.id, run);
        try {
            return await run;
        }
        finally {
            if (this.registrations.get(r.id) === run)
                this.registrations.delete(r.id);
        }
    }
    async result(actor, workdir, raw, signal) {
        try {
            const a = args(raw, ["assignment_id", "wait_ms"]);
            const id = assignmentId(a.assignment_id);
            const wait = a.wait_ms ?? 30000;
            if (typeof wait !== "number" || !Number.isSafeInteger(wait) || wait < 0 || wait > 120000)
                reject("DELEGATE_WAIT_INVALID");
            const scope = await this.scope(actor, workdir, true);
            await this.read(scope.parent, scope.workdir, id); // Reject a foreign id before queue reconciliation.
            await this.advance(scope.parent, scope.workdir);
            let wake;
            const noticed = new Promise((resolve) => { wake = resolve; });
            const group = this.waiters.get(id) ?? new Set();
            group.add(wake);
            this.waiters.set(id, group);
            let timer;
            const abort = () => wake();
            try {
                let receipt = await this.read(scope.parent, scope.workdir, id);
                if (!terminal(receipt) && receipt.status !== "unknown" && wait > 0) {
                    signal?.throwIfAborted();
                    signal?.addEventListener("abort", abort, { once: true });
                    await Promise.race([noticed, new Promise((resolve) => { timer = setTimeout(resolve, wait); })]);
                    signal?.throwIfAborted();
                    receipt = await this.read(scope.parent, scope.workdir, id);
                }
                return this.view(await this.register(scope.parent, receipt));
            }
            finally {
                if (timer)
                    clearTimeout(timer);
                signal?.removeEventListener("abort", abort);
                group.delete(wake);
                if (!group.size)
                    this.waiters.delete(id);
            }
        }
        catch (error) {
            return failure(error);
        }
    }
}
//# sourceMappingURL=delegation.js.map