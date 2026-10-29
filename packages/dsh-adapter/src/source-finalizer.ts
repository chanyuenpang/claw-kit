import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { serializeFailure } from "../lib/errors.js";
import { startNativeActivation } from "./native-start.js";
import type { ModelSelectionAgent } from "./model-selection.js";
import type { RoleSelection } from "../lib/role-preferences.js";

export type SourceDispatch = {
  schemaVersion?: number; dispatchId?: string; sourceSessionKey?: string; sourcePlan?: string;
  projectRoot?: string; prompt?: string; model?: string; reasoningEffort?: string;
};

/** Delivery dedup only. Knowledge completion belongs to the worker's ordinary plan. */
export function createSourceFinalizerDispatcher(input: {
  getService(name: string): unknown;
  selectModel(agent: ModelSelectionAgent, task: SourceDispatch): Promise<RoleSelection | undefined>;
}) {
  const deliveries = new Map<string, Promise<Record<string, unknown>>>();
  return (agent: { id: string }, workdir: string, task: SourceDispatch): Promise<Record<string, unknown>> => {
    if (task.schemaVersion !== 2) return Promise.resolve({ ok: false, code: "LEGACY_FINALIZER_NOT_RESUMED", reason: "Old knowledge jobs are not automatically dispatched." });
    const key = createHash("sha256").update(agent.id + "\0" + String(task.dispatchId)).digest("hex");
    const existing = deliveries.get(key);
    if (existing) return existing;
    const run = (async () => {
      const recordPath = path.join(task.projectRoot ?? workdir, ".claw", "runtime", "finalizer-deliveries", key + ".json");
      const selection = await input.selectModel(agent, task).catch(() => undefined);
      let logWarning: string | undefined;
      try {
        fs.mkdirSync(path.dirname(recordPath), { recursive: true });
        fs.writeFileSync(recordPath, JSON.stringify({ delivery: "attempted", dispatchId: task.dispatchId }), { flag: "wx" });
      } catch (error: any) {
        if (error?.code === "EEXIST") {
          let prior: any;
          try { prior = JSON.parse(fs.readFileSync(recordPath, "utf8")); } catch { /* uncertain delivery is not replayed */ }
          if (prior?.delivery !== "rejected") return { ok: prior?.delivery === "accepted", reused: true, delivery: prior?.delivery ?? "unknown",
            ...(prior?.runId ? { runId: prior.runId } : {}) };
          // Only a proven no-effect rejection permits another explicit delivery request.
          try { fs.writeFileSync(recordPath, JSON.stringify({ delivery: "attempted", dispatchId: task.dispatchId })); }
          catch (logError) { logWarning = serializeFailure(logError, { fallbackCode: "DELIVERY_LOG_UNAVAILABLE" }).code; }
        } else {
          // Logging failure must not prevent knowledge work. In-process dedup still applies.
          logWarning = serializeFailure(error, { fallbackCode: "DELIVERY_LOG_UNAVAILABLE" }).code;
        }
      }
      const record = (value: Record<string, unknown>) => {
        try { fs.writeFileSync(recordPath, JSON.stringify({ dispatchId: task.dispatchId, ...value })); }
        catch (error) { logWarning = serializeFailure(error, { fallbackCode: "DELIVERY_LOG_UNAVAILABLE" }).code; }
      };
      try {
        const child = await startNativeActivation(input.getService("subagents"), {
          provider: "spawn", label: "knowledge-source-" + task.dispatchId, signal: new AbortController().signal,
          request: { parent: agent, prompt: [{ type: "text", text: task.prompt ?? "" }],
            ...(selection?.applied?.options && Object.keys(selection.applied.options).length ? { agentOptions: selection.applied.options } : {}) },
        });
        record({ delivery: "accepted", ...(child.childId ? { runId: child.childId } : {}) });
        if (child.result) void Promise.resolve(child.result).catch(() => undefined).finally(() => child.dispose?.()).catch(() => undefined);
        return { ok: true, delivery: "accepted", executor: "native-one-shot", ...(child.childId ? { runId: child.childId } : {}),
          ...(selection ? { modelSelection: selection } : {}), ...(logWarning ? { logWarning } : {}) };
      } catch (error) {
        const failure = serializeFailure(error, { fallbackCode: "NATIVE_ADMISSION_UNKNOWN", operation: "finalizer.dispatch", origin: "dsh", fallbackOutcome: "unknown" });
        const delivery = failure.outcome === "known" && failure.effect === "none" ? "rejected" : "unknown";
        record({ delivery, code: failure.code });
        return { ok: false, delivery, ...failure, ...(logWarning ? { logWarning } : {}) };
      }
    })();
    deliveries.set(key, run);
    void run.then(result => { if (result.delivery === "rejected") deliveries.delete(key); }).catch(() => undefined);
    return run;
  };
}
