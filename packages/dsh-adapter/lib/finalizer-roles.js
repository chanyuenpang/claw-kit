import { serializeFailure, safeFailureCode } from "../lib/errors.js";
import { createHash } from "node:crypto";
import { startNativeActivation } from "./native-start.js";
import path from "node:path";
import { roleLaunchRecipe, tryParseRoleSelection } from "../lib/role-preferences.js";
import { selectDshRoleModel } from "./model-selection.js";
const ROLE = "claw-knowledge-finalizer";
const LABEL_PREFIX = "claw-kit:knowledge-finalizer:v1:";
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : undefined;
const string = (v) => typeof v === "string" && v.length > 0 ? v : undefined;
function safeErrorCode(error, fallback) {
    return serializeFailure(error, { fallbackCode: fallback }).code;
}
const text = (s) => [{ type: "text", text: s }];
const deferred = (error, phase = "admission", operation = "finalizer.admission") => {
    const input = typeof error === "string" && safeFailureCode(error) ? { code: error, message: error } : error;
    const failure = serializeFailure(input, { fallbackCode: operation.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_FAILED", fallbackOutcome: "unknown", origin: "dsh", operation });
    return { ok: false, deferred: true, ...failure, phase: failure.phase ?? phase };
};
const terminal = (status) => ["succeeded", "failed", "expired"].includes(status);
export function finalizerConfigFingerprint(agent, workdir, dispatch, provider) {
    const workspace = path.resolve(workdir);
    if (dispatch.selection)
        return createHash("sha256").update(JSON.stringify({
            workspace: process.platform === "win32" ? workspace.toLowerCase() : workspace,
            parent: agent.id, role: "finalizer", provider, recipe: roleLaunchRecipe(dispatch.selection),
        })).digest("hex");
    // Legacy records retain their identity until the original admission settles.
    return createHash("sha256").update(JSON.stringify({
        workspace: process.platform === "win32" ? workspace.toLowerCase() : workspace,
        provider, llmProvider: agent.options?.provider ?? null,
        model: dispatch.model ?? agent.options?.model ?? null,
        reasoningEffort: dispatch.reasoningEffort ?? agent.options?.reasoningEffort ?? null,
    })).digest("hex");
}
export function nativeFinalizerRoleId(parentId, fingerprint) {
    const bytes = createHash("sha256").update("claw-finalizer-v1:" + parentId + ":" + fingerprint).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 80;
    bytes[8] = (bytes[8] & 63) | 128;
    const value = bytes.toString("hex");
    return [value.slice(0, 8), value.slice(8, 12), value.slice(12, 16), value.slice(16, 20), value.slice(20)].join("-");
}
function marker(id) { return "claw-finalizer-dispatch:v1:" + id + "\n"; }
function bootstrap() {
    return "You are claw-kit's reusable background knowledge-finalizer role, not a foreground Team dependency. " +
        "This message initializes the role ONLY: do not create a plan, claim a job, scan jobs, or write files yet. Wait for an adapter-owned claw-finalizer-dispatch message. " +
        "For each later assignment use only its exact finalizeId, fresh claim and new knowledgeCapture:false auxiliary plan bound to your own session; never reuse old claims, task conclusions, reports, delegate plans or completion tokens. " +
        "Reread current canonical Truth/ADR and this job's frozen materials. Retained memory is not evidence for a new job. " +
        "Execute assignments yourself through claw_run; do not start teammates/subagents or send a peer message to the Lead. " +
        "Persist the current job's terminal result; the adapter closes a matching finished delegate when safe. Follow returned workflow guidance if closure remains deferred, never act on an unrelated plan. " +
        "The adapter owns dispatch, queueing and parent notification; do not manage the parent plan. Reply ready and wait.";
}
/** Per-parent admission serialization only; canonical jobs, not this map, own execution. */
export class FinalizerRoleDispatcher {
    deps;
    admissions = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    dispatch(agent, workdir, dispatch, capability) {
        const key = agent.id + ":" + path.resolve(workdir);
        const previous = this.admissions.get(key) ?? Promise.resolve();
        const run = previous.catch(() => undefined).then(async () => {
            const supplied = tryParseRoleSelection(dispatch.selection);
            const selection = supplied ?? await selectDshRoleModel({ agent, role: "finalizer",
                supportsOptions: capability.selectedRoute === "native" && capability.supportsOptions === true,
                getService: this.deps.getService, hints: { model: dispatch.model, reasoningEffort: dispatch.reasoningEffort } });
            return this.dispatchSerial(agent, workdir, { ...dispatch, selection }, capability);
        });
        this.admissions.set(key, run);
        void run.finally(() => { if (this.admissions.get(key) === run)
            this.admissions.delete(key); }).catch(() => undefined);
        return run;
    }
    async call(operation, agent, workdir, args) {
        const result = await this.deps.command(operation, agent.id, workdir, args);
        if (result.ok !== true) {
            const failure = serializeFailure(result.error ?? result, { fallbackCode: "DSH_EXECUTION_LEDGER_UNAVAILABLE", operation: "finalizer." + operation, origin: "cli", fallbackOutcome: "unknown" });
            throw Object.assign(new Error(failure.message), failure);
        }
        return result;
    }
    async fresh(agent, dispatch, previous, creating = false) {
        this.deps.signal.throwIfAborted();
        return true; // Existing admission fixes the target; current owner method decides the real call.
    }
    nativeService(creating = false) {
        const service = this.deps.getService("subagents");
        if (!service || typeof service.sendMessage !== "function" || creating &&
            (typeof service.listChildren !== "function" || typeof service.startActivation !== "function"))
            throw Object.assign(new Error("DSH_NATIVE_SERVICE_UNAVAILABLE"), { code: "DSH_NATIVE_SERVICE_UNAVAILABLE" });
        return service;
    }
    async freshNative(agent, dispatch, capability, creating = false) {
        if (!await this.fresh(agent, dispatch, capability, creating))
            throw Object.assign(new Error("DSH_NATIVE_CAPABILITY_CHANGED"), { code: "DSH_NATIVE_CAPABILITY_CHANGED" });
        return this.nativeService(true);
    }
    async nativeMember(service, agent, label, expectedId) {
        let rows;
        for (let attempt = 0; attempt < 2 && !rows; attempt++) {
            try {
                const observed = await service.listChildren(agent.id);
                if (Array.isArray(observed))
                    rows = observed;
            }
            catch { /* one bounded read retry; no start/send has occurred */ }
        }
        if (!rows || expectedId && rows.some(x => x.kind === "diagnostic" && x.id === expectedId))
            throw Object.assign(new Error("DSH_NATIVE_ROLE_CATALOG_UNAVAILABLE"), { code: "DSH_NATIVE_ROLE_CATALOG_UNAVAILABLE" });
        // listChildren returns catalog entries without kind/activity. Older Hosts
        // returned tagged UI entries; retain those without requiring that projection.
        const candidates = rows.filter(x => (x.kind === undefined || x.kind === "child") && x.label === label);
        // Prior adapter versions could create several identical roles by filtering
        // out every untagged entry. New jobs reuse the first compatible catalog row
        // (Host event order); an existing reservation ALWAYS retains its exact ID.
        // dispatchSerial has already reconciled the canonical joint-terminal blocker.
        const row = expectedId ? candidates.find(x => x.id === expectedId)
            : candidates.find(x => string(x.id) && x.mode === "continuable") ?? candidates[0];
        if (!row) {
            if (expectedId)
                throw Object.assign(new Error("DSH_FINALIZER_EXECUTOR_PINNED"), { code: "DSH_FINALIZER_EXECUTOR_PINNED" });
            return undefined;
        }
        // The Host owns durable child IDs. Stable label + exact persisted member ID
        // identify reuse; provider/activity remain advisory observations.
        const rowId = string(row.id);
        if (!rowId || row.label !== label || row.mode !== "continuable"
            || expectedId && rowId !== expectedId)
            throw Object.assign(new Error("DSH_FINALIZER_ROLE_INCOMPATIBLE"), { code: "DSH_FINALIZER_ROLE_INCOMPATIBLE" });
        return { id: rowId, target: rowId, created: false };
    }
    acknowledged(execution, status) {
        return { ok: true, reused: true, queued: status === "queued", runId: execution.memberSessionId, executor: execution.route, deliveryKey: execution.deliveryKey, deliveryState: execution.delivery.state, ...(execution.delivery.receiptId ? { messageId: execution.delivery.receiptId } : {}),
            ...(tryParseRoleSelection(execution.modelSelection) ? { modelSelection: tryParseRoleSelection(execution.modelSelection) } : {}) };
    }
    async recoverAcknowledgement(agent, workdir, finalizeId) {
        const response = await this.call("inspect", agent, workdir, ["--finalize-id", finalizeId]);
        const rows = response.executions;
        const row = rows?.find(x => x.finalizeId === finalizeId);
        if (row?.execution && (row.execution.delivery.state === "accepted" || row.status === "running" || terminal(row.status)))
            return this.acknowledged(row.execution, row.status);
        return undefined;
    }
    async recoverTeamReceipt(agent, execution) {
        if (execution.route !== "team")
            return undefined;
        const events = await this.deps.readParentEvents(agent.id);
        const ids = new Set();
        for (const event of events) {
            const e = record(event);
            const data = record(e?.data);
            const message = record(data?.message);
            if (e?.type !== "team/message/queued" || data?.version !== 2 || data.teamId !== execution.teamId || message?.senderId !== agent.id || message.targetId !== execution.memberSessionId)
                continue;
            const content = message.content;
            const first = Array.isArray(content) ? record(content[0]) : undefined;
            if (first?.type !== "text" || !string(first.text)?.startsWith(marker(execution.deliveryKey)))
                continue;
            const id = string(message.id);
            if (id)
                ids.add(id);
        }
        if (ids.size > 1)
            throw Object.assign(new Error("DSH_FINALIZER_MULTIPLE_DELIVERY_RECEIPTS"), { code: "DSH_FINALIZER_MULTIPLE_DELIVERY_RECEIPTS" });
        return ids.values().next().value;
    }
    async member(agent, dispatch, capability, fingerprint, existing) {
        const provider = capability.provider ?? "spawn";
        if (capability.selectedRoute === "team") {
            const service = this.deps.getService("agentTeams");
            const description = LABEL_PREFIX + fingerprint + " background";
            const rows = await service.listMembers(agent);
            if (!Array.isArray(rows))
                throw Object.assign(new Error("DSH_TEAM_ROSTER_UNAVAILABLE"), { code: "DSH_TEAM_ROSTER_UNAVAILABLE" });
            const candidates = rows.filter(x => x.name === ROLE);
            if (candidates.length > 1)
                throw Object.assign(new Error("DSH_FINALIZER_ROLE_AMBIGUOUS"), { code: "DSH_FINALIZER_ROLE_AMBIGUOUS" });
            if (candidates.length) {
                const row = candidates[0];
                if (row.role !== "teammate" || row.status === "failed" || !string(row.id))
                    throw Object.assign(new Error("DSH_FINALIZER_ROLE_INCOMPATIBLE"), { code: "DSH_FINALIZER_ROLE_INCOMPATIBLE" });
                return { id: row.id, target: row.name, created: false };
            }
            if (!await this.fresh(agent, dispatch, capability))
                throw Object.assign(new Error("DSH_TEAM_CAPABILITY_CHANGED"), { code: "DSH_TEAM_CAPABILITY_CHANGED" });
            const spawned = await service.spawnTeammate(agent, { name: ROLE, description, prompt: text(bootstrap()), context: "fresh", provider, signal: this.deps.signal });
            const row = spawned?.member;
            if (!row || !string(row.id) || row.name !== ROLE || row.status === "failed")
                throw Object.assign(new Error("DSH_FINALIZER_ROLE_CREATION_UNCERTAIN"), { code: "DSH_FINALIZER_ROLE_CREATION_UNCERTAIN" });
            return { id: row.id, target: row.name, created: true };
        }
        const label = LABEL_PREFIX + fingerprint.slice(0, 16);
        let service = await this.freshNative(agent, dispatch, capability);
        const found = await this.nativeMember(service, agent, label, existing?.memberSessionId);
        if (found)
            return found;
        if (existing && !tryParseRoleSelection(existing.modelSelection))
            throw Object.assign(new Error("DSH_FINALIZER_EXECUTOR_PINNED"), { code: "DSH_FINALIZER_EXECUTOR_PINNED" });
        // Service handles are replaceable Cordis views, not durable authority
        // credentials. Recheck capability, reacquire the current service, then
        // re-read its catalog before a single start attempt.
        service = await this.freshNative(agent, dispatch, capability, true);
        const raced = await this.nativeMember(service, agent, label, existing?.memberSessionId);
        if (raced)
            return raced;
        const agentOptions = dispatch.selection?.applied.options ?? {};
        let started;
        try {
            started = await startNativeActivation(service, { provider, label, signal: this.deps.signal, request: { parent: agent, prompt: text(bootstrap()), ...(Object.keys(agentOptions).length ? { agentOptions } : {}) } });
        }
        catch (error) {
            const failure = serializeFailure(error, { fallbackCode: "DSH_FINALIZER_MEMBER_START_REJECTED", operation: "native.member.start", origin: "host", fallbackOutcome: "unknown" });
            throw Object.assign(new Error(failure.message), failure);
        }
        if (!string(started.childId))
            throw Object.assign(new Error("DSH_FINALIZER_ROLE_ID_MISSING"), { code: "DSH_FINALIZER_ROLE_ID_MISSING" });
        return { id: started.childId, target: started.childId, created: true };
    }
    async dispatchSerial(agent, workdir, dispatch, capability) {
        let operation = "finalizer.inspect", phase = "inspect";
        try {
            const inspection = await this.call("inspect", agent, workdir, []);
            if (!Array.isArray(inspection.executions))
                return deferred("DSH_EXECUTION_LEDGER_INVALID");
            let rows = inspection.executions;
            let reconciled = false;
            for (const row of rows) {
                if (row.execution && !row.readyForNext && (terminal(row.status) || (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()))) {
                    operation = "finalizer.release";
                    phase = "release";
                    await this.call("release", agent, workdir, ["--finalize-id", row.finalizeId]);
                    reconciled = true;
                }
            }
            if (reconciled) {
                const refreshed = await this.call("inspect", agent, workdir, []);
                if (!Array.isArray(refreshed.executions))
                    return deferred("DSH_EXECUTION_LEDGER_INVALID");
                rows = refreshed.executions;
            }
            const current = rows.find(x => x.finalizeId === dispatch.finalizeId);
            if (!current)
                return deferred("DSH_FINALIZER_JOB_UNAVAILABLE");
            let execution = current.execution;
            // The canonical ledger owns the admitted target. Reject authority/identity
            // mismatches before acknowledgements or sends, not advisory catalog drift.
            if (execution && (execution.parentSessionId !== agent.id || execution.deliveryKey !== dispatch.finalizeId
                || !string(execution.memberSessionId)))
                return deferred("DSH_EXECUTION_LEDGER_INVALID");
            const persistedSelection = tryParseRoleSelection(execution?.modelSelection);
            if (persistedSelection)
                dispatch = { ...dispatch, selection: persistedSelection };
            if (execution && (execution.delivery.state === "accepted" || current.status === "running" || terminal(current.status)))
                return this.acknowledged(execution, current.status);
            if (current.status !== "queued")
                return deferred("DSH_FINALIZER_JOB_NOT_QUEUED");
            if (execution && execution.delivery.state !== "reserved") {
                const receiptId = await this.recoverTeamReceipt(agent, execution);
                if (!receiptId)
                    return deferred("DSH_FINALIZER_DELIVERY_UNCERTAIN", "reconcile");
                await this.call("delivery", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--delivery-key", dispatch.finalizeId, "--state", "accepted", "--receipt-id", receiptId]);
                return this.acknowledged({ ...execution, delivery: { state: "accepted", receiptId } }, current.status);
            }
            const pinnedNative = execution?.route === "native-continuable";
            if (!pinnedNative && (!capability.ready || !capability.reusable))
                return deferred(capability.reason ?? "DSH_REUSABLE_FINALIZER_UNAVAILABLE", "capability");
            // Legacy admissions are never reinterpreted as new soft preferences.
            if (execution && !persistedSelection)
                dispatch = { ...dispatch, selection: undefined };
            const fingerprint = execution && (pinnedNative || !persistedSelection) ? execution.configFingerprint
                : finalizerConfigFingerprint(agent, workdir, dispatch, capability.provider ?? "spawn");
            const route = pinnedNative ? "native-continuable" : capability.selectedRoute === "team" ? "team" : "native-continuable";
            if (execution && !pinnedNative && (execution.route !== route || execution.teamId !== capability.teamId
                || execution.provider !== (capability.provider ?? "spawn") || execution.configFingerprint !== fingerprint))
                return deferred("DSH_FINALIZER_EXECUTOR_PINNED");
            const blocker = rows.find(x => x.finalizeId !== dispatch.finalizeId && x.execution && !x.readyForNext);
            if (blocker)
                return { ok: true, queued: true, admitted: false, delivered: false, phase: "waiting-for-role", blockingFinalizeId: blocker.finalizeId };
            operation = "finalizer.member";
            phase = "admission";
            // A reserved native executor needs no discovery or creation. The Host send
            // owner validates this exact ledger target; never recreate or redirect it.
            const member = pinnedNative && execution
                ? { id: execution.memberSessionId, target: execution.memberSessionId, created: false }
                : await this.member(agent, dispatch, capability, fingerprint, execution);
            if (execution && execution.memberSessionId !== member.id)
                return deferred("DSH_FINALIZER_EXECUTOR_PINNED");
            if (!execution) {
                operation = "finalizer.reserve";
                phase = "reserve";
                const reserved = await this.call("reserve", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--route", route, "--member-session-id", member.id, ...(capability.teamId ? ["--team-id", capability.teamId] : []), "--provider", capability.provider ?? "spawn", "--config-fingerprint", fingerprint,
                    ...(dispatch.selection ? ["--model-selection", JSON.stringify(dispatch.selection)] : [])]);
                if (reserved.admitted !== true)
                    return { ok: true, queued: true, admitted: false, delivered: false, phase: "waiting-for-role", reason: reserved.reason, blockingFinalizeId: reserved.blockingFinalizeId };
                execution = reserved.execution;
            }
            if (!execution || execution.deliveryKey !== dispatch.finalizeId)
                return deferred("DSH_EXECUTION_LEDGER_INVALID");
            if (!await this.fresh(agent, dispatch, capability))
                return deferred("DSH_FINALIZER_CAPABILITY_CHANGED", "capability");
            const team = route === "team" ? this.deps.getService("agentTeams") : undefined;
            const native = route === "native-continuable" ? this.nativeService() : undefined;
            const sendNative = native?.sendMessage.bind(native);
            const attempt = await this.call("delivery", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--delivery-key", dispatch.finalizeId, "--state", "attempted"]);
            if (attempt.deliver !== true)
                return deferred("DSH_FINALIZER_DELIVERY_UNCERTAIN", "reconcile");
            let receiptId;
            try {
                const content = text(marker(dispatch.finalizeId) + dispatch.prompt);
                receiptId = team
                    ? (await team.sendMessage(agent, { target: member.target, content, signal: this.deps.signal })).messageId
                    : await sendNative(agent, member.id, content, { signal: this.deps.signal });
                if (!string(receiptId))
                    throw Object.assign(new Error("DSH_FINALIZER_DELIVERY_RECEIPT_MISSING"), { code: "DSH_FINALIZER_DELIVERY_RECEIPT_MISSING" });
            }
            catch (error) {
                const failure = deferred(error, "dispatch", "native.send");
                try {
                    await this.call("delivery", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--delivery-key", dispatch.finalizeId, "--state", "uncertain"]);
                }
                catch (secondary) {
                    failure.diagnostics = [serializeFailure(secondary, { fallbackCode: "DELIVERY_UNCERTAIN_PERSIST_FAILED", operation: "delivery.uncertain.persist", origin: "cli" })];
                }
                return failure;
            }
            try {
                await this.call("delivery", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--delivery-key", dispatch.finalizeId, "--state", "accepted", "--receipt-id", receiptId]);
            }
            catch (error) {
                const failure = { ...deferred(error, "receipt-persist", "finalizer.delivery.persist"), admitted: true, deliveryAccepted: true, receiptId };
                try {
                    await this.call("delivery", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--delivery-key", dispatch.finalizeId, "--state", "uncertain"]);
                }
                catch (secondary) {
                    failure.diagnostics = [serializeFailure(secondary, { fallbackCode: "DELIVERY_UNCERTAIN_PERSIST_FAILED", operation: "delivery.uncertain.persist", origin: "cli" })];
                }
                return failure;
            }
            return { ok: true, queued: true, admitted: true, delivered: true, runId: member.id, reused: !member.created, executor: route, messageId: receiptId, deliveryKey: dispatch.finalizeId,
                ...(dispatch.selection ? { modelSelection: dispatch.selection } : {}) };
        }
        catch (error) {
            return deferred(error, phase, operation);
        }
    }
}
//# sourceMappingURL=finalizer-roles.js.map