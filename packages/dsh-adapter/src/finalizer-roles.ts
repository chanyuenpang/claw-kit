import { createHash } from "node:crypto";
import path from "node:path";
import { resolveDshDelegationCapability, type DshDelegationCapability } from "./team-capability.js";

export type FinalizerAgent = {
  id: string;
  options?: { provider?: string; model?: string; reasoningEffort?: string };
  session?: { header?: { parentSession?: string } };
};
export type ReusableDispatch = { finalizeId: string; prompt: string; model?: string | null; reasoningEffort?: string | null };
type Execution = {
  route: "team" | "native-continuable";
  parentSessionId: string;
  memberSessionId: string;
  teamId?: string;
  provider: string;
  configFingerprint: string;
  deliveryKey: string;
  delivery: { state: "reserved" | "attempted" | "accepted" | "uncertain"; receiptId?: string };
  delegatePlanPath?: string;
  releasedAt?: string;
};
type Inspection = { finalizeId: string; status: string; expiresAt?: string; execution?: Execution; readyForNext: boolean; reason?: string };
type Json = Record<string, unknown>;
type Member = { id: string; name: string; description?: string; role: string; status: string; provider?: string; context?: string; diagnostics?: unknown[] };
type TeamRuntime = {
  listMembers(agent: FinalizerAgent): Member[] | Promise<Member[]>;
  spawnTeammate(agent: FinalizerAgent, request: { name: string; description: string; prompt: { type: "text"; text: string }[]; context: "fresh"; provider: string; signal: AbortSignal }): Promise<{ member: Member }>;
  sendMessage(agent: FinalizerAgent, request: { target: string; content: { type: "text"; text: string }[]; signal: AbortSignal }): Promise<{ messageId: string; status?: string }>;
};
type NativeRuntime = {
  listChildren(parentId: string): Promise<Array<{ kind: string; id?: string; label?: string; mode?: string; activity?: string; provider?: string }>>;
  startContinuable(spec: { childId: string; provider: string; label: string; signal: AbortSignal; request: { parent: FinalizerAgent; prompt: { type: "text"; text: string }[]; agentOptions?: { model?: string; reasoningEffort?: string } } }): Promise<{ childId: string; messageId: string }>;
  sendMessage(parent: FinalizerAgent, childId: string, content: { type: "text"; text: string }[], options: { signal: AbortSignal }): Promise<string>;
};
export type FinalizerRoleDependencies = {
  getService(name: string): unknown;
  command(operation: "inspect" | "reserve" | "delivery" | "release", actorId: string, workdir: string, args: string[]): Promise<Json>;
  readParentEvents(parentId: string): Promise<unknown[]>;
  signal: AbortSignal;
};
const ROLE = "claw-knowledge-finalizer";
const LABEL_PREFIX = "claw-kit:knowledge-finalizer:v1:";
const record = (v: unknown): Json | undefined => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Json : undefined;
const string = (v: unknown): string | undefined => typeof v === "string" && v.length > 0 ? v : undefined;
const text = (s: string): { type: "text"; text: string }[] => [{ type: "text", text: s }];
const deferred = (code: string, phase = "admission"): Json => ({
  ok: false, deferred: true, code: /^[A-Z][A-Z0-9_]{0,95}$/.test(code) ? code : "DSH_FINALIZER_EXECUTION_FAILED", phase,
});
const terminal = (status: string): boolean => ["succeeded", "failed", "expired"].includes(status);
export function finalizerConfigFingerprint(agent: FinalizerAgent, workdir: string, dispatch: ReusableDispatch, provider: string): string {
  const workspace = path.resolve(workdir);
  return createHash("sha256").update(JSON.stringify({
    workspace: process.platform === "win32" ? workspace.toLowerCase() : workspace,
    provider, llmProvider: agent.options?.provider ?? null,
    model: dispatch.model ?? agent.options?.model ?? null,
    reasoningEffort: dispatch.reasoningEffort ?? agent.options?.reasoningEffort ?? null,
  })).digest("hex");
}
export function nativeFinalizerRoleId(parentId: string, fingerprint: string): string {
  const bytes = createHash("sha256").update("claw-finalizer-v1:" + parentId + ":" + fingerprint).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const value = bytes.toString("hex");
  return [value.slice(0, 8), value.slice(8, 12), value.slice(12, 16), value.slice(16, 20), value.slice(20)].join("-");
}
function marker(id: string): string { return "claw-finalizer-dispatch:v1:" + id + "\n"; }
function bootstrap(): string {
  return "You are claw-kit's reusable background knowledge-finalizer role, not a foreground Team dependency. " +
    "This message initializes the role ONLY: do not create a plan, claim a job, scan jobs, or write files yet. Wait for an adapter-owned claw-finalizer-dispatch message. " +
    "For each later assignment use only its exact finalizeId, fresh claim and new session-scoped knowledgeCapture:false delegate plan; never reuse old claims, task conclusions, reports, delegate plans or completion tokens. " +
    "Reread current canonical Truth/ADR and this job's frozen materials. Retained memory is not evidence for a new job. " +
    "Execute assignments yourself through claw_run; do not start teammates/subagents or send a peer message to the Lead. " +
    "Persist the current job's terminal result; the adapter closes a matching finished delegate when safe. Follow returned workflow guidance if closure remains deferred, never act on an unrelated plan. " +
    "The adapter owns dispatch, queueing and parent notification; do not manage the parent plan. Reply ready and wait.";
}

/** Per-parent admission serialization only; canonical jobs, not this map, own execution. */
export class FinalizerRoleDispatcher {
  private admissions = new Map<string, Promise<unknown>>();
  constructor(private readonly deps: FinalizerRoleDependencies) {}
  dispatch(agent: FinalizerAgent, workdir: string, dispatch: ReusableDispatch, capability: DshDelegationCapability): Promise<Json> {
    const key = agent.id + ":" + path.resolve(workdir);
    const previous = this.admissions.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.dispatchSerial(agent, workdir, dispatch, capability));
    this.admissions.set(key, run);
    void run.finally(() => { if (this.admissions.get(key) === run) this.admissions.delete(key); }).catch(() => undefined);
    return run;
  }
  private async call(operation: "inspect" | "reserve" | "delivery" | "release", agent: FinalizerAgent, workdir: string, args: string[]): Promise<Json> {
    const result = await this.deps.command(operation, agent.id, workdir, args);
    if (result.ok !== true) throw new Error(string(record(result.error)?.code) ?? string(result.code) ?? "DSH_EXECUTION_LEDGER_UNAVAILABLE");
    return result;
  }
  private async fresh(agent: FinalizerAgent, dispatch: ReusableDispatch, previous: DshDelegationCapability): Promise<boolean> {
    this.deps.signal.throwIfAborted();
    const next = await resolveDshDelegationCapability({ getService: this.deps.getService, agent, role: "finalizer", provider: previous.provider ?? "spawn", requestedModel: dispatch.model, requestedReasoningEffort: dispatch.reasoningEffort });
    return next.ready && next.reusable === true && next.selectedRoute === previous.selectedRoute && next.teamId === previous.teamId && next.leadId === previous.leadId;
  }
  private acknowledged(execution: Execution, status?: string): Json {
    return { ok: true, reused: true, queued: status === "queued", runId: execution.memberSessionId, executor: execution.route, deliveryKey: execution.deliveryKey, deliveryState: execution.delivery.state, ...(execution.delivery.receiptId ? { messageId: execution.delivery.receiptId } : {}) };
  }
  async recoverAcknowledgement(agent: FinalizerAgent, workdir: string, finalizeId: string): Promise<Json | undefined> {
    const response = await this.call("inspect", agent, workdir, ["--finalize-id", finalizeId]);
    const rows = response.executions as Inspection[] | undefined;
    const row = rows?.find(x => x.finalizeId === finalizeId);
    if (row?.execution && (row.execution.delivery.state === "accepted" || row.status === "running" || terminal(row.status))) return this.acknowledged(row.execution, row.status);
    return undefined;
  }
  private async recoverTeamReceipt(agent: FinalizerAgent, execution: Execution): Promise<string | undefined> {
    if (execution.route !== "team") return undefined;
    const events = await this.deps.readParentEvents(agent.id);
    const ids = new Set<string>();
    for (const event of events) {
      const e = record(event); const data = record(e?.data); const message = record(data?.message);
      if (e?.type !== "team/message/queued" || data?.version !== 2 || data.teamId !== execution.teamId || message?.senderId !== agent.id || message.targetId !== execution.memberSessionId) continue;
      const content = message.content;
      const first = Array.isArray(content) ? record(content[0]) : undefined;
      if (first?.type !== "text" || !string(first.text)?.startsWith(marker(execution.deliveryKey))) continue;
      const id = string(message.id); if (id) ids.add(id);
    }
    if (ids.size > 1) throw new Error("DSH_FINALIZER_MULTIPLE_DELIVERY_RECEIPTS");
    return ids.values().next().value;
  }
  private async member(agent: FinalizerAgent, dispatch: ReusableDispatch, capability: DshDelegationCapability, fingerprint: string): Promise<{ id: string; target: string; created: boolean }> {
    const provider = capability.provider ?? "spawn";
    if (capability.selectedRoute === "team") {
      const service = this.deps.getService("agentTeams") as TeamRuntime;
      const description = LABEL_PREFIX + fingerprint + " background";
      const rows = await service.listMembers(agent);
      if (!Array.isArray(rows)) throw new Error("DSH_TEAM_ROSTER_UNAVAILABLE");
      const candidates = rows.filter(x => x.name === ROLE);
      if (candidates.length > 1) throw new Error("DSH_FINALIZER_ROLE_AMBIGUOUS");
      if (candidates.length) {
        const row = candidates[0]!;
        if (row.description !== description || row.role !== "teammate" || row.provider !== provider || row.context !== "fresh" || !["inactive", "running"].includes(row.status) || row.diagnostics?.length) throw new Error("DSH_FINALIZER_ROLE_INCOMPATIBLE");
        return { id: row.id, target: row.name, created: false };
      }
      if (!await this.fresh(agent, dispatch, capability) || this.deps.getService("agentTeams") !== service) throw new Error("DSH_TEAM_CAPABILITY_CHANGED");
      const spawned = await service.spawnTeammate(agent, { name: ROLE, description, prompt: text(bootstrap()), context: "fresh", provider, signal: this.deps.signal });
      const row = spawned?.member;
      if (!row || !string(row.id) || row.name !== ROLE || row.status === "failed") throw new Error("DSH_FINALIZER_ROLE_CREATION_UNCERTAIN");
      return { id: row.id, target: row.name, created: true };
    }
    const service = this.deps.getService("subagents") as NativeRuntime;
    const id = nativeFinalizerRoleId(agent.id, fingerprint);
    const label = LABEL_PREFIX + fingerprint.slice(0, 16);
    const rows = await service.listChildren(agent.id);
    if (!Array.isArray(rows) || rows.some(x => x.kind === "diagnostic")) throw new Error("DSH_NATIVE_ROLE_CATALOG_UNAVAILABLE");
    const candidates = rows.filter(x => x.kind === "child" && x.label?.startsWith(LABEL_PREFIX));
    if (candidates.length > 1) throw new Error("DSH_FINALIZER_ROLE_AMBIGUOUS");
    if (candidates.length) {
      const row = candidates[0]!;
      if (row.id !== id || row.label !== label || row.mode !== "continuable" || row.provider !== provider || !["inactive", "running"].includes(row.activity ?? "")) throw new Error("DSH_FINALIZER_ROLE_INCOMPATIBLE");
      return { id, target: id, created: false };
    }
    if (!await this.fresh(agent, dispatch, capability) || this.deps.getService("subagents") !== service) throw new Error("DSH_NATIVE_CAPABILITY_CHANGED");
    const agentOptions = { ...(dispatch.model ? { model: dispatch.model } : {}), ...(dispatch.reasoningEffort ? { reasoningEffort: dispatch.reasoningEffort } : {}) };
    const started = await service.startContinuable({ childId: id, provider, label, signal: this.deps.signal, request: { parent: agent, prompt: text(bootstrap()), ...(Object.keys(agentOptions).length ? { agentOptions } : {}) } });
    if (started.childId !== id) throw new Error("DSH_FINALIZER_ROLE_ID_MISMATCH");
    return { id, target: id, created: true };
  }
  private async dispatchSerial(agent: FinalizerAgent, workdir: string, dispatch: ReusableDispatch, capability: DshDelegationCapability): Promise<Json> {
    try {
      if (!capability.ready || !capability.reusable) return deferred(capability.reason ?? "DSH_REUSABLE_FINALIZER_UNAVAILABLE", "capability");
      const inspection = await this.call("inspect", agent, workdir, []);
      if (!Array.isArray(inspection.executions)) return deferred("DSH_EXECUTION_LEDGER_INVALID");
      let rows = inspection.executions as Inspection[];
      let reconciled = false;
      for (const row of rows) {
        if (row.execution && !row.readyForNext && (terminal(row.status) || (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()))) {
          await this.call("release", agent, workdir, ["--finalize-id", row.finalizeId]);
          reconciled = true;
        }
      }
      if (reconciled) {
        const refreshed = await this.call("inspect", agent, workdir, []);
        if (!Array.isArray(refreshed.executions)) return deferred("DSH_EXECUTION_LEDGER_INVALID");
        rows = refreshed.executions as Inspection[];
      }
      const current = rows.find(x => x.finalizeId === dispatch.finalizeId);
      if (!current) return deferred("DSH_FINALIZER_JOB_UNAVAILABLE");
      let execution = current.execution;
      if (execution && (execution.delivery.state === "accepted" || current.status === "running" || terminal(current.status))) return this.acknowledged(execution, current.status);
      if (current.status !== "queued") return deferred("DSH_FINALIZER_JOB_NOT_QUEUED");
      const fingerprint = finalizerConfigFingerprint(agent, workdir, dispatch, capability.provider ?? "spawn");
      const route = capability.selectedRoute === "team" ? "team" : "native-continuable";
      if (execution && (execution.route !== route || execution.teamId !== capability.teamId || execution.configFingerprint !== fingerprint)) return deferred("DSH_FINALIZER_EXECUTOR_PINNED");
      if (execution && execution.delivery.state !== "reserved") {
        const receiptId = await this.recoverTeamReceipt(agent, execution);
        if (!receiptId) return deferred("DSH_FINALIZER_DELIVERY_UNCERTAIN", "reconcile");
        await this.call("delivery", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--delivery-key", dispatch.finalizeId, "--state", "accepted", "--receipt-id", receiptId]);
        return this.acknowledged({ ...execution, delivery: { state: "accepted", receiptId } }, current.status);
      }
      const blocker = rows.find(x => x.finalizeId !== dispatch.finalizeId && x.execution && !x.readyForNext);
      if (blocker) return { ok: true, queued: true, admitted: false, delivered: false, phase: "waiting-for-role", blockingFinalizeId: blocker.finalizeId };
      if (!await this.fresh(agent, dispatch, capability)) return deferred("DSH_FINALIZER_CAPABILITY_CHANGED", "capability");
      const member = await this.member(agent, dispatch, capability, fingerprint);
      if (execution && execution.memberSessionId !== member.id) return deferred("DSH_FINALIZER_EXECUTOR_PINNED");
      if (!execution) {
        const reserved = await this.call("reserve", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--route", route, "--member-session-id", member.id, ...(capability.teamId ? ["--team-id", capability.teamId] : []), "--provider", capability.provider ?? "spawn", "--config-fingerprint", fingerprint]);
        if (reserved.admitted !== true) return { ok: true, queued: true, admitted: false, delivered: false, phase: "waiting-for-role", reason: reserved.reason, blockingFinalizeId: reserved.blockingFinalizeId };
        execution = reserved.execution as Execution;
      }
      if (!execution || execution.deliveryKey !== dispatch.finalizeId) return deferred("DSH_EXECUTION_LEDGER_INVALID");
      if (!await this.fresh(agent, dispatch, capability)) return deferred("DSH_FINALIZER_CAPABILITY_CHANGED", "capability");
      const team = route === "team" ? this.deps.getService("agentTeams") as TeamRuntime : undefined;
      const native = route === "native-continuable" ? this.deps.getService("subagents") as NativeRuntime : undefined;
      const attempt = await this.call("delivery", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--delivery-key", dispatch.finalizeId, "--state", "attempted"]);
      if (attempt.deliver !== true) return deferred("DSH_FINALIZER_DELIVERY_UNCERTAIN", "reconcile");
      let receiptId: string;
      try {
        if (!await this.fresh(agent, dispatch, capability) || (team && this.deps.getService("agentTeams") !== team) || (native && this.deps.getService("subagents") !== native)) throw new Error("DSH_FINALIZER_CAPABILITY_CHANGED");
        const content = text(marker(dispatch.finalizeId) + dispatch.prompt);
        receiptId = team
          ? (await team.sendMessage(agent, { target: member.target, content, signal: this.deps.signal })).messageId
          : await native!.sendMessage(agent, member.id, content, { signal: this.deps.signal });
        if (!string(receiptId)) throw new Error("DSH_FINALIZER_DELIVERY_RECEIPT_MISSING");
      } catch (error) {
        await this.call("delivery", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--delivery-key", dispatch.finalizeId, "--state", "uncertain"]).catch(() => undefined);
        return deferred(error instanceof Error ? error.message : "DSH_FINALIZER_DELIVERY_UNCERTAIN", "dispatch");
      }
      await this.call("delivery", agent, workdir, ["--finalize-id", dispatch.finalizeId, "--delivery-key", dispatch.finalizeId, "--state", "accepted", "--receipt-id", receiptId]);
      return { ok: true, queued: true, admitted: true, delivered: true, runId: member.id, reused: !member.created, executor: route, messageId: receiptId, deliveryKey: dispatch.finalizeId };
    } catch (error) {
      return deferred(error instanceof Error ? error.message : "DSH_FINALIZER_EXECUTION_FAILED");
    }
  }
}
