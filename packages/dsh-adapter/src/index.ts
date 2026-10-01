import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPlanFinalAnswers, type EventLike } from "./capture.js";
import { ClawSession, type ClawExecuteResult, type SubprocessLike } from "./claw-session.js";
import {
  compactClawOutput,
  consumeHostActions,
  type GoalsLike,
  type HostAction,
  type JsonValue,
} from "./host-actions.js";
import { daemonInput, isUncertainConnectionFailure, renderGuidanceSnapshot } from "./protocol.js";
import { registerBundledSkills } from "./skills.js";
import { routeCommand, runCommandBaseline, resolveCommandEntry } from "./command-route.js";
import { handleProjectConfigRpc, type WorkspaceRegistry } from "./project-config-rpc.js";

export const name = "claw-kit";

// ---------------------------------------------------------------------------
// Finalizer dispatch record (finalizeId -> live writer child)
//
// The adapter -- never the model -- owns "at most one unsettled writer child
// per finalizeId". This is a COST invariant, not a write mutex: a second child
// is harmless because the durable job's claim gate refuses it (the writer
// template stops when `claimed` is false). What this record removes is the
// duplicate spawn plus its claim call, and it closes the only path that could
// still produce a second writer: the model retrying a failed dispatch by hand.
//
// The key is the finalizeId alone; it already embeds the parent session id
// (CLI/core owns its derivation), so a process-wide map stays session-scoped.
// ---------------------------------------------------------------------------
export type FinalizerDispatchRecord = { runId: string; settled: boolean };
const finalizerDispatches = new Map<string, FinalizerDispatchRecord>();

type SubagentChildLike = {
  kind?: string;
  id?: string;
  activity?: string;
  mode?: string;
  label?: string;
};

export type SubagentsLike = {
  start(
    name: string,
    request: {
      label?: string;
      prompt: Array<{ type: string; text: string }>;
      parent: unknown;
      signal?: AbortSignal;
    },
  ): Promise<{ id: string; result?: Promise<unknown>; dispose?: () => Promise<void> }>;
  listChildren?(parentSessionId: string): Promise<SubagentChildLike[]>;
};

/** The label every writer child for one finalizeId carries. */
export function finalizerChildLabel(finalizeId: string): string {
  // Native child labels use the full identifier; delegate plan titles stay short.
  return `knowledge-finalizer-${finalizeId}`;
}

/**
 * Decide whether a writer child for this finalizeId is already live, so the
 * dispatch can be skipped instead of starting a second one.
 *
 * Two sources, cheapest first:
 *  1. the in-process record — a writer child this process started and has
 *     not seen settle. No race, covers repeated dispatches.
 *  2. the durable child catalog — this parent's children, filtered to a
 *     still-running child carrying the finalizeId label. Covers an adapter
 *     process restart, where the in-process map is gone. The label is
 *     durable for one-shot children too (the runtime snapshots a descriptor
 *     for every child it starts), which is why the finalizer can stay
 *     one-shot and still be found.
 *
 * A missing or damaged child catalog cannot prove absence. Defer dispatch
 * instead of spawning a second child after an uncertain native start.
 */
export async function resolveFinalizerReuse(input: {
  finalizeId: string;
  parentSessionId: string;
  label: string;
  subagents?: SubagentsLike;
  records?: Map<string, FinalizerDispatchRecord>;
}): Promise<{ runId: string; source: "in-process" | "durable" } | { deferred: true; reason: string } | undefined> {
  const records = input.records ?? finalizerDispatches;
  const record = records.get(input.finalizeId);
  if (record !== undefined && !record.settled) {
    return { runId: record.runId, source: "in-process" };
  }
  const subagents = input.subagents;
  if (subagents === undefined || typeof subagents.listChildren !== "function") {
    return { deferred: true, reason: "native child catalog unavailable" };
  }
  try {
    const children = await subagents.listChildren(input.parentSessionId);
    if (!Array.isArray(children) || children.some((child) => child?.kind === "diagnostic")) {
      return { deferred: true, reason: "native child catalog incomplete" };
    }
    const legacyLabel = `knowledge-finalizer-${input.finalizeId.slice(0, 12)}`;
    for (const child of children) {
      if (child?.kind === "child" && child.activity === "running"
        && (child.label === input.label || child.label === legacyLabel)
        && typeof child.id === "string") return { runId: child.id, source: "durable" };
    }
    return undefined;
  } catch {
    return { deferred: true, reason: "native child catalog lookup failed" };
  }
}

const FINALIZER_MANUAL_RETRY_GUIDANCE =
  "Do not run or retry the knowledge finalizer manually. The durable queued job is reconciled by the adapter on the next system entry; an uncertain native child creation must be checked before another launch.";

function collectorVersion(): string {
  const packageJsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  return String((JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: unknown }).version ?? "unknown");
}

// The caller's workspace cwd. DSH's Session public surface does not expose a
// cwd (agent.session.cwd / meta.cwd are absent), and sandboxPolicy.workspaceRoot
// / process.cwd() may be the host launcher's directory (e.g. System32). The
// authoritative root is the workspace that OWNS this session: the workspace
// registry lists each workspace's `sessionIds`, and its `path` is the real
// project directory. Session-header cwd is a fallback for non-registry hosts.
type WorkspaceRegistryLike = {
  list(): Promise<Array<{ id?: string; title?: string; path?: string; sessionIds?: readonly string[] }>>;
};

function isDirectory(candidate: string | undefined): candidate is string {
  if (typeof candidate !== "string" || !candidate.trim()) return false;
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

async function resolveWorkdir(
  agent: { id?: string; session?: { cwd?: string; meta?: { cwd?: string }; header?: { cwd?: string } } } | undefined,
  workspaceRegistry: WorkspaceRegistryLike | undefined,
): Promise<string | undefined> {
  // 1. Agent public API exposes no cwd getter; prefer the session header —
  //    the durable, authority-backed cwd inherited from the parent workspace
  //    (subagent children copy parentHeader.cwd at creation). Then fall back
  //    to the legacy meta/cwd shapes used by earlier adapter versions.
  for (const candidate of [
    agent?.session?.header?.cwd,
    agent?.session?.cwd,
    agent?.session?.meta?.cwd,
  ]) {
    if (isDirectory(candidate)) return candidate;
  }
  // 2. workspaceRegistry: sessions attach to a workspace record; a subagent
  //    child inherits the parent's cwd through its header (handled above) and
  //    is usually absent from sessionIds, so registry matching is the
  //    fallback for top-level sessions the header does not cover.
  if (workspaceRegistry && typeof workspaceRegistry.list === "function" && agent?.id) {
    try {
      const workspaces = await workspaceRegistry.list();
      for (const workspace of workspaces) {
        if (
          Array.isArray(workspace.sessionIds)
          && workspace.sessionIds.includes(agent.id)
          && isDirectory(workspace.path)
        ) {
          return workspace.path;
        }
      }
    } catch {
      // registry unavailable — fall through to the error path
    }
  }
  return undefined;
}

// Hard dependencies: the loader must delay activation until every service the
// apply body reads is mounted. Without `inject`, a dependency-free row
// activates immediately — before subprocess/tools/systemPrompt exist — and the
// guard below silently returns, registering nothing.
export const inject = ["subprocess", "tools", "systemPrompt", "skills", "goals", "connection"];

export type DshTodo = { content: string; status: "pending" | "in_progress" | "completed" };

export function createAgentGuidanceStore(): {
  get(scope: object | undefined): string;
  set(agent: object, guidance: string): void;
} {
  const values = new WeakMap<object, string>();
  return {
    get: (scope) => scope ? values.get(scope) ?? "" : "",
    set: (agent, guidance) => values.set(agent, guidance),
  };
}

export function projectTodos(
  projection: HostAction | undefined,
  output: Record<string, unknown> | undefined,
): DshTodo[] | undefined {
  const planInput = projection?.input as Record<string, unknown> | undefined;
  const planTasks = Array.isArray(planInput?.plan)
    ? (planInput.plan as Array<Record<string, unknown>>).map((step) => ({
        title: typeof step.step === "string" ? step.step : "",
        status: typeof step.status === "string" ? step.status : "",
      }))
    : undefined;
  const outputTasks = Array.isArray(output?.tasks)
    ? output.tasks as Array<Record<string, unknown>>
    : (output?.planView as Record<string, unknown> | undefined)?.tasks as
        | Array<Record<string, unknown>>
        | undefined;
  // An explicit empty projection means clear the dock; only an absent
  // projection may fall back to compact output tasks.
  const tasks = planTasks ?? outputTasks;
  if (!Array.isArray(tasks)) return undefined;
  return tasks
    .map((task) => {
      const title = typeof task.title === "string" ? task.title.trim() : "";
      const status = typeof task.status === "string" ? task.status : "";
      if (!title) return null;
      const todoStatus = status === "done" || status === "completed"
        ? "completed"
        : status === "in_progress" || status === "active"
          ? "in_progress"
          : "pending";
      return { content: title, status: todoStatus };
    })
    .filter((entry): entry is DshTodo => entry !== null);
}

// ── Cordis plugin ───────────────────────────────────────────────────────────
export function apply(ctx: unknown): void {
  const c = ctx as {
    get(name: string): unknown;
    on(name: string, listener: (...args: unknown[]) => void): () => void;
  };
  const subprocess = c.get("subprocess") as SubprocessLike | undefined;
  const tools = c.get("tools") as { register(definition: unknown): () => void } | undefined;
  const systemPrompt = c.get("systemPrompt") as
    | { section(input: unknown): () => void; context(input: unknown): () => void }
    | undefined;
  const goals = c.get("goals") as GoalsLike | undefined;
  if (subprocess === undefined || tools === undefined || systemPrompt === undefined) return;

  // workspaceRegistry is resolved lazily at execution time (c.get inside the
  // callbacks): it mounts later than subprocess/tools, so a snapshot taken
  // during apply may be undefined.
  const resolveRegistry = (): WorkspaceRegistryLike | undefined =>
    c.get("workspaceRegistry") as WorkspaceRegistryLike | undefined;

  // Bundled skills: shared-synced (planning/config/create-claw-skill/
  // claw-kit-doc) plus host-specific (using-claw-kit/researcher) register into
  // the layered registry as a bundled source. Fail-open if the service is
  // absent or the provider errors.
  const skillsService = c.get("skills") as
    | { registerProvider(create: (control: unknown) => unknown): () => void }
    | undefined;
  if (skillsService !== undefined) {
    try {
      registerBundledSkills(skillsService);
    } catch {
      // fail-open
    }
  }

  // Match the CLI registry identity: an agent visiting a different workspace
  // must never reuse a transport fixed to its previous workdir.
  const sessionKey = (agentId: string, workdir: string): string =>
    `${process.platform === "win32" ? path.resolve(workdir).toLowerCase() : path.resolve(workdir)}\0${agentId}`;
  const SESSION_TRANSPORT_IDLE_MS = 10 * 60 * 1000;
  const sessions = new Map<string, ClawSession>();
  const reclaiming = new Set<ClawSession>();
  const release = (key: string, session: ClawSession, reason: string): void => {
    if (sessions.get(key) !== session) return;
    sessions.delete(key);
    reclaiming.add(session);
    void session.close(reason).catch((error: unknown) => {
      console.warn(`[claw-kit] session transport close failed for ${session.status().workdir} ${session.status().sessionId}:`, error);
    }).finally(() => reclaiming.delete(session));
  };
  const guidanceByAgent = createAgentGuidanceStore();

  systemPrompt.context({
    name: "claw:workflow",
    order: 60,
    // Prompt assembly is scoped by the calling agent. Keep each web thread's
    // workflow snapshot on that exact scope key so concurrent sessions cannot
    // overwrite one another with a global last-writer value.
    text: (context: { scope?: object }) => guidanceByAgent.get(context.scope) || renderGuidanceSnapshot(undefined),
  });
  systemPrompt.section({
    name: "tool:claw",
    order: 115,
    text: [
      "claw-kit workflow: load the `using-claw-kit` skill first whenever the adapter is enabled or its start prompt is present, then follow its claw_run execution route as the only next-step contract. The `claw_run` tool executes plan, task, subplan, and search operations; commandHints returned by claw_run map 1:1 to its arguments. The adapter consumes progress projection and goal sync automatically — do not call goal tools or maintain a parallel task list for claw plans.",
    ].join("\n"),
  });

  // Scan one-off CLI output for the first protocol JSON object.
  function parseProtocol(text: string): Record<string, unknown> | null {
    for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') quoted = false;
        } else if (ch === '"') quoted = true;
        else if (ch === "{") depth++;
        else if (ch === "}" && --depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, i + 1)) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
          } catch {
            // unrelated braces
          }
          break;
        }
      }
    }
    return null;
  }

  async function runOneOff(
    argv: string[],
    workdir: string | undefined,
    sessionId: string,
    stdinPayload?: string,
  ): Promise<{ text: string; errText: string }> {
    // After the guard above, subprocess is always present; closure narrowing
    // is lost, so rebind it.
    const sp = subprocess as SubprocessLike;
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
        void handle.terminate("host-report-stdin-unavailable").catch(() => undefined);
        throw new Error("DSH_REPORT_TRANSPORT_UNAVAILABLE: private CLI stdin is unavailable.");
      }
      handle.stdin.end(stdinPayload);
    }
    const outcome = await handle.done as { exitCode?: number | null; code?: number | null; signal?: string | null };
    const readOutput = (reader: { readFrom?(offset: number): { text: string; lossy: boolean }; finalize(): { text: string } } | undefined): string => {
      const collected = reader?.readFrom?.(0);
      if (collected?.lossy) throw new Error("claw one-off output was truncated");
      return collected?.text ?? reader?.finalize().text ?? "";
    };
    const text = readOutput(handle.collected?.stdout);
    const errText = readOutput(handle.collected?.stderr);
    if ((outcome.exitCode ?? outcome.code) !== 0 || outcome.signal) {
      throw new Error("claw " + argv[0] + " exited without success: " + errText.slice(-4096));
    }
    return { text, errText };
  }

  type PendingDispatch = { finalizeId?: string; policy?: string; prompt?: string;
    startedAt?: string; captureStatus?: "pending" | "captured" };
  const dispatchFlights = new Map<string, Promise<Record<string, JsonValue>>>();
  const completedSweeps = new Set<string>();
  const pendingSweeps = new Map<string, Promise<void>>();
  async function readPendingDispatches(parentId: string, workdir: string): Promise<PendingDispatch[]> {
    const { text } = await runOneOff(["internal-knowledge-pending"], workdir, parentId);
    const protocol = parseProtocol(text);
    if (protocol?.ok !== true || !Array.isArray(protocol.dispatches)) {
      throw new Error("Trusted queued-finalizer inspection returned no dispatch inventory.");
    }
    return protocol.dispatches as PendingDispatch[];
  }
  async function captureDshParentReport(parentId: string, workdir: string, dispatch: PendingDispatch): Promise<void> {
    if (dispatch.captureStatus === "captured") return;
    const startedAt = dispatch.startedAt ? Date.parse(dispatch.startedAt) : Number.NaN;
    if (!Number.isFinite(startedAt)) throw new Error("DSH_REPORT_BOUNDARY_UNAVAILABLE");
    const sessionQuery = c.get("sessionQuery") as
      | { readSession(sessionId: string): Promise<{ events?: unknown[] }> } | undefined;
    if (!sessionQuery) throw new Error("DSH_REPORT_HOST_UNAVAILABLE");
    const snapshot = await sessionQuery.readSession(parentId);
    if (!snapshot || !Array.isArray(snapshot.events)) throw new Error("DSH_REPORT_HISTORY_UNAVAILABLE");
    const events = extractPlanFinalAnswers(snapshot.events as EventLike[], parentId, startedAt);
    const payload = JSON.stringify({ events });
    if (Buffer.byteLength(payload, "utf8") > 1024 * 1024) throw new Error("DSH_REPORT_TOO_LARGE");
    const { text } = await runOneOff(["internal-dsh-host-report-capture",
      "--finalize-id", String(dispatch.finalizeId), "--collector-version", collectorVersion()],
    workdir, parentId, payload);
    const result = parseProtocol(text);
    if (result?.ok !== true || result.captured !== true) throw new Error("DSH_REPORT_COMMIT_FAILED");
  }

  async function recordDshIssue(parentId: string, workdir: string, finalizeId: string,
    phase: "capture" | "dispatch" | "writer", code: string): Promise<void> {
    const correlationId = finalizeId.slice(0, 12) + "_" + Date.now().toString(36);
    try {
      const { text } = await runOneOff(["internal-dsh-finalizer-issue", "--finalize-id", finalizeId,
        "--phase", phase, "--code", code, "--correlation-id", correlationId], workdir, parentId);
      if (parseProtocol(text)?.ok !== true) throw new Error("status not acknowledged");
    } catch {
      console.warn("[claw-kit] finalizer diagnostic storage unavailable:", phase, code);
    }
  }

  async function readDshAlerts(parentId: string, workdir: string): Promise<{ alerts: JsonValue[]; error?: string }> {
    try {
      const { text } = await runOneOff(["internal-dsh-finalizer-alerts"], workdir, parentId);
      const result = parseProtocol(text);
      if (result?.ok !== true || !Array.isArray(result.alerts)) throw new Error("invalid alert inventory");
      return { alerts: result.alerts as JsonValue[] };
    } catch {
      return { alerts: [], error: "FINALIZER_ALERTS_UNAVAILABLE" };
    }
  }

  function safeCaptureFailureCode(error: unknown): string {
    const known = new Set(["DSH_REPORT_BOUNDARY_UNAVAILABLE", "DSH_REPORT_HOST_UNAVAILABLE",
      "DSH_REPORT_HISTORY_UNAVAILABLE", "DSH_REPORT_TOO_LARGE", "DSH_REPORT_TRANSPORT_UNAVAILABLE",
      "DSH_REPORT_CAPTURE_INVALID", "DSH_REPORT_CAPTURE_DENIED", "DSH_REPORT_CAPTURE_UNAVAILABLE",
      "DSH_REPORT_COMMIT_FAILED"]);
    for (const code of String(error).match(/DSH_REPORT_[A-Z_]+/g) ?? []) {
      if (known.has(code)) return code;
    }
    return "DSH_REPORT_HOST_FAILURE";
  }

  async function dispatchOne(agent: { id: string }, workdir: string, dispatch: PendingDispatch): Promise<Record<string, JsonValue>> {
    const finalizeId = String(dispatch.finalizeId ?? "");
    if (!/^[a-f0-9]{64}$/i.test(finalizeId) || !dispatch.prompt) {
      return { ok: false, retryable: false, reason: "Invalid canonical finalizer dispatch." };
    }
    const key = sessionKey(agent.id, workdir) + "\0" + finalizeId.toLowerCase();
    const inFlight = dispatchFlights.get(key);
    if (inFlight) return inFlight;
    const run = (async (): Promise<Record<string, JsonValue>> => {
      const deferred = async (phase: "capture" | "dispatch", code: string): Promise<Record<string, JsonValue>> => {
        await recordDshIssue(agent.id, workdir, finalizeId, phase, code);
        return { ok: false, phase, code, guidance: FINALIZER_MANUAL_RETRY_GUIDANCE };
      };
      const subagents = c.get("subagents") as SubagentsLike | undefined;
      if (!subagents) return { ...await deferred("dispatch", "NATIVE_SUBAGENTS_UNAVAILABLE"), retryable: false };
      const reused = await resolveFinalizerReuse({
        finalizeId, parentSessionId: agent.id, label: finalizerChildLabel(finalizeId), subagents,
      });
      if (reused && "deferred" in reused) {
        return deferred("dispatch", "CHILD_CATALOG_UNAVAILABLE");
      }
      if (reused) return { ok: true, reused: true, runId: reused.runId, policy: dispatch.policy ?? "subagent" };
      // The job may have been claimed or expired while native children were listed.
      let pending: PendingDispatch[];
      try { pending = await readPendingDispatches(agent.id, workdir); }
      catch { return deferred("dispatch", "QUEUED_INVENTORY_UNAVAILABLE"); }
      const current = pending.find((item) => item.finalizeId === finalizeId);
      if (!current) {
        return { ok: false, reason: "The canonical finalizer job is no longer queued." };
      }
      try {
        await captureDshParentReport(agent.id, workdir, current);
      } catch (error) {
        return deferred("capture", safeCaptureFailureCode(error));
      }
      try {
        const controller = new AbortController();
        const child = await subagents.start("spawn", {
          label: finalizerChildLabel(finalizeId), prompt: [{ type: "text", text: dispatch.prompt! }],
          parent: agent, signal: controller.signal,
        });
        const runId = String(child.id);
        finalizerDispatches.set(finalizeId, { runId, settled: false });
        if (child.result !== undefined) {
          const settle = (): void => {
            const record = finalizerDispatches.get(finalizeId);
            if (record?.runId === runId) record.settled = true;
            // Core ignores this if knowledge.done already committed a terminal result.
            void recordDshIssue(agent.id, workdir, finalizeId, "writer", "WRITER_CHILD_EXITED");
          };
          void Promise.resolve(child.result).then(settle, settle)
            .finally(() => (child.dispose ? child.dispose() : undefined)).catch(() => undefined);
        }
        return { ok: true, runId, policy: dispatch.policy ?? "subagent" };
      } catch (error) {
        // Native admission can have succeeded before its acknowledgement failed.
        // The next entry must inspect the child catalog, not blindly start again.
        return deferred("dispatch", "NATIVE_ADMISSION_UNKNOWN");
      }
    })();
    dispatchFlights.set(key, run);
    try { return await run; } finally { if (dispatchFlights.get(key) === run) dispatchFlights.delete(key); }
  }
  async function sweepPending(agent: { id: string; session?: { header?: { parentSession?: string } } }, workdir: string, force = false): Promise<void> {
    if (agent.session?.header?.parentSession) return; // Never dispatch the parent's jobs from a writer child.
    const key = sessionKey(agent.id, workdir);
    const current = pendingSweeps.get(key);
    if (current) return current;
    if (!force && completedSweeps.has(key)) return;
    const sweep = (async () => {
      try {
        const pending = await readPendingDispatches(agent.id, workdir);
        let deferred = false;
        for (const dispatch of pending) {
          const result = await dispatchOne(agent, workdir, dispatch);
          if (result.ok !== true) {
            deferred = true;
            console.warn("[claw-kit] queued finalizer dispatch deferred:", result.code ?? result.reason);
          }
        }
        if (deferred) completedSweeps.delete(key);
        else completedSweeps.add(key);
      } catch {
        console.warn("[claw-kit] queued finalizer reconciliation deferred: QUEUED_INVENTORY_UNAVAILABLE");
      }
    })();
    pendingSweeps.set(key, sweep);
    try { await sweep; } finally { if (pendingSweeps.get(key) === sweep) pendingSweeps.delete(key); }
  }

  async function recoverClaimReceipt(agentId: string, workdir: string, finalizeId: unknown): Promise<ClawExecuteResult | undefined> {
    if (typeof finalizeId !== "string" || !/^[a-f0-9]{64}$/i.test(finalizeId)) return;
    const key = sessionKey(agentId, workdir);
    let recovery = sessions.get(key);
    if (!recovery) {
      recovery = new ClawSession(subprocess as SubprocessLike, workdir, agentId, "claw", 15000, SESSION_TRANSPORT_IDLE_MS,
        (idle) => release(key, idle, "idle-timeout"), (dead) => release(key, dead, "child-exit"));
      sessions.set(key, recovery);
    }
    const input = { finalizeId };
    const receipt = await recovery.request("knowledge.claim.receipt", input, 30000, (send) => routeCommand(
      send, () => runCommandBaseline(subprocess as SubprocessLike, workdir, agentId, "knowledge.claim.receipt", input),
    ));
    if (receipt.ok !== true || receipt.output?.claimed !== true) return;
    // Preserve the original model operation: this is its lost receipt, not a
    // second claim or a new model-visible operation.
    return { ...receipt, command: "knowledge.claim", output: { ...receipt.output, command: "knowledge.claim", recovered: true } };
  }

  // Settings uses a dedicated browser RPC channel. Its payload contains only a registry
  // workspace id and config operation fields: no browser-supplied filesystem paths.
  const connection = c.get("connection") as {
    rpc?: { handle(channel: string, handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>): unknown };
  } | undefined;
  if (connection?.rpc?.handle) {
    // Authenticated, read-only transport census. The OS process tree maps
    // runner/target PIDs via the session ID and workdir in their argv.
    void connection.rpc.handle("/claw-session-lifecycle", async () => ({
      ok: true,
      value: {
        schemaVersion: 1, idleTimeoutMs: SESSION_TRANSPORT_IDLE_MS,
        sessions: [...new Set([...sessions.values(), ...reclaiming])].map((session) => session.status()),
      },
    }));
    void connection.rpc.handle("/claw-project-config", async (endpoint, payload) => {
      const registry = resolveRegistry() as WorkspaceRegistry | undefined;
      if (!registry) return {
        ok: false,
        error: { code: "WORKSPACE_REGISTRY_UNAVAILABLE", message: "DSH workspace registry is unavailable.", details: {} },
      };
      return handleProjectConfigRpc(endpoint, payload, registry, (argv, cwd) => runOneOff(argv, cwd, "dsh-project-config"));
    });
  }

  // Session-start: auto-claw equivalent — recover a bound plan and inject its
  // compact guidance snapshot. Fail-open.
  c.on("agent/session-start", (payload: unknown) => {
    const agent = (payload as {
      agent?: { id?: string; session?: { cwd?: string; meta?: { cwd?: string }; header?: { cwd?: string; parentSession?: string } } };
    })?.agent;
    if (!agent?.id) return;
    void (async () => {
      try {
        const workdir = await resolveWorkdir(agent, resolveRegistry());
        if (workdir === undefined) return;
        try {
          const { text } = await runOneOff(["context", "--host", "dsh"], workdir, agent.id!);
          const parsed = parseProtocol(text);
          const rendered = renderGuidanceSnapshot(parsed ?? undefined);
          if (rendered) guidanceByAgent.set(agent, rendered);
        } catch { /* Context is fail-open; finalizer recovery is independent. */ }
        await sweepPending(agent as { id: string; session?: { header?: { parentSession?: string } } }, workdir);
        if (!agent.session?.header?.parentSession) {
          const status = await readDshAlerts(agent.id!, workdir);
          if (status.alerts.length) guidanceByAgent.set(agent, (guidanceByAgent.get(agent) ?? "")
            + "\nFinalizer alerts (canonical job status, do not manually retry): " + JSON.stringify(status.alerts));
        }
      } catch {
        // fail-open
      }
    })();
  });

  // A parent snapshots proven history before writer dispatch; no project-global executable collector.

  c.on("dispose", () => {
    for (const [id, session] of sessions) release(id, session, "plugin-dispose");
  });

  tools.register({
    name: "claw_run",
    description: [
      "Run one claw-kit workflow operation in the current session through the claw session daemon. Operation names use dot form: context, plan.create, plan.start, plan.wait, plan.resume, plan.edit, plan.done, plan.show, task.add, task.edit, task.done, subplan.create, knowledge.claim, knowledge.done, search, search.index.refresh. `search.index.refresh` takes no arguments and refreshes only the calling session's project vector index. `context` restores the current host-scoped startup snapshot with no arguments. Other arguments use canonical snake_case: plan.create takes title, goal, scope; plan.start takes goal, requirements, questions, acceptance, rules, key_decisions, references, and add_tasks; plan.edit accepts the same plan fields plus summary, removal fields, retrospective fields, status, or an ordered canonical operations array; plan.resume takes optional plan_id; plan.done takes retrospective, key_decisions, what_worked, issues, and follow_ups; task.add takes title/detail or tasks; task.done takes id/choice or tasks; knowledge.claim takes finalize_id and knowledge.done takes finalize_id, claim_token, status, plus result (succeeded) or error (failed). References are arrays of {path, why}.",
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
      render(_args: unknown, value: unknown) {
        return [{ type: "text", text: JSON.stringify(value) }];
      },
    },
    async execute(args: { operation?: string; args?: Record<string, unknown> }, exec: { agent?: unknown; signal?: AbortSignal }): Promise<Record<string, JsonValue>> {
      const agent = exec?.agent as { id?: string; session?: { cwd?: string; meta?: { cwd?: string }; header?: { cwd?: string; parentSession?: string } } } | undefined;
      if (!agent?.id) throw new Error("claw_run requires a calling agent");
      const operation = String(args.operation ?? "");
      if (!operation) throw new Error("operation is required");
      const workdir = await resolveWorkdir(agent, resolveRegistry());
      if (workdir === undefined) {
        throw new Error(
          "claw_run requires a valid session workspace; no workspace owns this session and agent.session.cwd resolved to none",
        );
      }
      const input = daemonInput(operation, (args.args ?? {}) as Record<string, unknown>);
      // Recover queued writers on the first trusted parent entry, independently
      // of any later plan terminal response. Child sessions never own this sweep.
      await sweepPending(agent as { id: string; session?: { header?: { parentSession?: string } } }, workdir);
      if (operation === "context") {
        const { text } = await runOneOff(["context", "--host", "dsh"], workdir, agent.id);
        const context = parseProtocol(text);
        if (!context) throw new Error("claw context returned no valid JSON protocol result");
        const alerts = agent.session?.header?.parentSession ? { alerts: [] as JsonValue[] }
          : await readDshAlerts(agent.id, workdir);
        if (alerts.alerts.length) context.finalizationAlerts = alerts.alerts;
        if (alerts.error) context.finalizationAlertError = alerts.error;
        const rendered = renderGuidanceSnapshot(context);
        if (rendered) guidanceByAgent.set(agent, rendered + (alerts.alerts.length
          ? "\nFinalizer alerts (canonical job status, do not manually retry): " + JSON.stringify(alerts.alerts) : ""));
        return context as Record<string, JsonValue>;
      }
      const key = sessionKey(agent.id, workdir);
      let session = sessions.get(key);
      if (!session) {
        session = new ClawSession(subprocess as SubprocessLike, workdir, agent.id, "claw", 15000, SESSION_TRANSPORT_IDLE_MS,
          (idle) => release(key, idle, "idle-timeout"),
          (dead) => release(key, dead, "child-exit"));
        sessions.set(key, session);
      }
      let response: ClawExecuteResult;
      const request = session.request(operation, input, 30000, (send) => routeCommand(
        send, () => runCommandBaseline(subprocess as SubprocessLike, workdir, agent.id!, operation, input),
      ));
      const requestOrdinal = session.status().requestsStarted;
      try {
        response = await request;
      } catch (error) {
        // The daemon may have committed before its response was lost. Reset the
        // transport for the next request, but never replay this mutation.
        const message = error instanceof Error ? error.message : String(error);
        if (!isUncertainConnectionFailure(message) && !message.startsWith("CLAW_OUTCOME_UNKNOWN:")) throw error;
        try { await session.close(); } catch { /* best-effort */ }
        if (sessions.get(key) === session) sessions.delete(key);
        completedSweeps.delete(key);
        if (operation === "knowledge.claim") {
          let recovered: ClawExecuteResult | undefined;
          try { recovered = await recoverClaimReceipt(agent.id, workdir, (input as { finalizeId?: unknown }).finalizeId); }
          catch { /* An unavailable receipt cannot license replay of a claim. */ }
          if (!recovered) throw new Error("CLAW_OUTCOME_UNKNOWN: " + message + ". Claim receipt could not be authenticated; do not retry the claim.");
          response = recovered;
        } else {
          await sweepPending(agent as { id: string; session?: { header?: { parentSession?: string } } }, workdir, true);
          throw new Error("CLAW_OUTCOME_UNKNOWN: " + message + ". The operation may already have committed; do not retry it.");
        }
      }
      if (response.ok !== true) {
        // Some daemon failures report the same uncertain transport condition
        // as a protocol error. Treat them identically: no automatic replay.
        const message = response.error?.message ?? "";
        if (response.error?.outcome === "unknown" || isUncertainConnectionFailure(message)) {
          try { await session.close(); } catch { /* best-effort */ }
          if (sessions.get(key) === session) sessions.delete(key);
          completedSweeps.delete(key);
          if (operation === "knowledge.claim") {
            let recovered: ClawExecuteResult | undefined;
            try { recovered = await recoverClaimReceipt(agent.id, workdir, (input as { finalizeId?: unknown }).finalizeId); }
            catch { /* Read-only recovery failed; never replay the original claim. */ }
            if (!recovered) throw new Error("CLAW_OUTCOME_UNKNOWN: " + message + ". Claim receipt is unavailable; do not retry the claim.");
            response = recovered;
          } else {
            await sweepPending(agent as { id: string; session?: { header?: { parentSession?: string } } }, workdir, true);
            throw new Error("CLAW_OUTCOME_UNKNOWN: " + message + ". The operation may already have committed; do not retry it.");
          }
        }
      }
      if (response.ok !== true) {
        throw new Error(
          `claw operation failed: ${response.command ?? "unknown"} — ${response.error?.message ?? "no detail"}`,
        );
      }
      const { consumed, projection, failures } = consumeHostActions(
        response.hostActions as HostAction[] | undefined,
        goals,
        exec.agent,
      );
      const visible = compactClawOutput(response.output, operation);
      if (operation === "knowledge.claim" && response.output?.recovered === true) visible.recovered = true;
      if (consumed.length) visible.goalSync = consumed as unknown as JsonValue;
      if (projection !== undefined) visible.projection = projection.input as unknown as JsonValue;
      if (failures.length) visible.hostEffectFailures = failures as unknown as JsonValue;
      // Keep the injected [claw workflow] context current: every claw_run
      // returns the latest plan snapshot, so refresh lastGuidance instead of
      // leaving the session-start snapshot stale (progress otherwise freezes
      // at the first plan state seen this session). Fail-open.
      try {
        const rendered = renderGuidanceSnapshot(response.output as Record<string, unknown> | undefined);
        if (rendered) guidanceByAgent.set(agent, rendered);
      } catch {
        // fail-open
      }
      // Drive the DSH-native todo dock (conversation.input.dock id=todo) from
      // the claw plan: map plan tasks to todo/write items so the UI shows the
      // plan's step progress bar. Whole-list replace, last-write-wins — the
      // same seam the model-facing todo_write tool uses. Fail-open.
      try {
        const agentWithSession = exec.agent as
          | { session?: { append(type: string, data: unknown): unknown } }
          | undefined;
        if (agentWithSession?.session && typeof agentWithSession.session.append === "function") {
          // Prefer an update_plan projection, including an explicit empty plan
          // used to clear the dock; only a missing projection falls back.
          const todos = projectTodos(
            projection,
            response.output as Record<string, unknown> | undefined,
          );
          if (todos !== undefined) {
            agentWithSession.session.append("todo/write", { todos });
          }
        }
      } catch {
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
        // Dispatch first captures available parent history through the live Host.
        const dispatch = response.knowledgeDispatch as { policy?: string; finalizeId?: string; prompt?: string };
        visible.dispatch = await dispatchOne(agent as { id: string }, workdir, dispatch) as unknown as JsonValue;
        // A failed dispatch stays queued and is retried by the next trusted entry.
        completedSweeps.delete(key);
        // Keep only a compact dispatch summary in the model-visible output:
        // the full writer prompt is consumed by the subagent, and a huge
        // prompt was pushing `dispatch` past truncation. Never expose prompt.
        visible.knowledgeDispatch = {
          schemaVersion: 1,
          policy: dispatch?.policy ?? "subagent",
          finalizeId: dispatch?.finalizeId,
        } as unknown as JsonValue;
      }
      // Move dispatch to the front so truncation cannot hide the dispatch
      // confirmation (large projections previously pushed it past the limit).
      // Only re-insert when a dispatch actually exists: assigning undefined
      // broke DSH's lossless-JSON tool-output validation (a plain plan.create
      // returned "value is not lossless JSON" once 0.2.26.0 loaded — learned
      // 2026-08-22).
      const dispatchValue = visible.dispatch;
      delete visible.dispatch;
      const reordered: Record<string, JsonValue> = {};
      for (const key of Object.keys(visible)) {
        reordered[key] = visible[key] as JsonValue;
        if (key === "command" && dispatchValue !== undefined) reordered.dispatch = dispatchValue;
      }
      // A completed plan has no reason to keep its stdio transport resident.
      // Dispatch/host effects above must finish first. A concurrent next-plan
      // request wins the lease and prevents us from closing its live transport.
      if (operation === "plan.done" && response.ok) {
        const state = session.status();
        if (state.queued === 0 && state.requestsStarted === requestOrdinal) release(key, session, "plan.done");
      }
      return reordered;
    },
    presentCall: (callArgs: { operation?: string }) => ({
      card: "generic",
      title: "claw",
      kind: "other",
      rawInput: String(callArgs?.operation ?? ""),
    }),
  });
}

export default { name, inject, apply };
