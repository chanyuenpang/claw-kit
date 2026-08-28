import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  SESSION_PROTOCOL_VERSION,
  type SessionDaemonState,
  type SessionProtocolRequest,
  type SessionProtocolResponse,
} from "@veewo/claw-client";
import {
  ClawError,
  recoverProjectFocusTransitions,
  releaseCurrentPlanFocus,
  resolveProjectContext,
  writeJsonFileAtomic,
} from "@veewo/claw-core";
import { ClawCommandService } from "./command-service.js";
import {
  RegistryFocusSessionStore,
  SessionRegistryV2,
  createSessionIdentity,
  ensurePrivateDirectory,
  sessionFocusKey,
} from "./session-registry-v2.js";

const MAX_PROTOCOL_LINE_BYTES = 1024 * 1024;
const SESSION_PASSTHROUGH_ERRORS = new Set([
  "SESSION_NOT_FOUND",
  "SESSION_EXPIRED",
  "SESSION_IDENTITY_INVALID",
  "CURRENT_PLAN_REQUIRED",
  "PLAN_CREATE_BLOCKED_BY_PROCESS_PLAN",
  "PLAN_NOT_FOUND",
  "PLAN_NOT_RESUMABLE",
  "PLAN_FOCUS_CONFLICT",
  "PLAN_TRANSITION_CONFLICT",
  "FOCUS_RECOVERY_CONFLICT",
  "SESSION_OPERATION_UNSUPPORTED",
]);

type ConnectionState = {
  socket: net.Socket;
  buffer: string;
  chain: Promise<void>;
  sessionHandle?: string;
  sessionKeyHash?: string;
  agentSessionId?: string;
  canonicalWorkdir?: string;
  focusKey?: string;
  host?: string;
};

export type RunningSessionDaemon = {
  state: SessionDaemonState;
  close(): Promise<void>;
};

export async function startSessionDaemon(options?: {
  runtimeRoot?: string;
  idleTtlMs?: number;
}): Promise<RunningSessionDaemon> {
  const registry = new SessionRegistryV2(options?.runtimeRoot);
  ensurePrivateDirectory(path.join(registry.runtimeRoot, "daemon"));
  const releaseStartLock = acquireStartLock(registry.runtimeRoot);
  registry.recover();
  const focusStore = new RegistryFocusSessionStore(registry);
  const service = new ClawCommandService(registry);
  const token = randomBytes(32).toString("hex");
  const activeSessions = new Map<string, ConnectionState>();
  const connections = new Set<ConnectionState>();
  const server = net.createServer();
  let idleTimer: NodeJS.Timeout | undefined;
  let closing = false;

  const cleanupExpiredSessions = async (): Promise<void> => {
    const live = new Set(activeSessions.keys());
    for (const expired of registry.listExpiredRecords(new Date(), live)) {
      if (expired.record.currentPlan) {
        const identity = createSessionIdentity(
          expired.record.agentSessionId,
          expired.record.canonicalWorkdir,
        );
        try {
          const project = resolveProjectContext(identity.canonicalWorkdir);
          await releaseCurrentPlanFocus({
            project,
            sessionKey: sessionFocusKey(identity),
            kind: "expire",
            sessionStore: focusStore,
          });
        } catch (error) {
          if (error instanceof ClawError) continue;
          throw error;
        }
      }
      registry.removeReleasedExpired(expired.sessionKeyHash);
    }
  };

  const scheduleIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    if (connections.size > 0) return;
    const idleTtlMs = options?.idleTtlMs
      ?? Number(process.env.CLAW_SESSION_DAEMON_IDLE_TTL_MS ?? 300_000);
    if (!Number.isFinite(idleTtlMs) || idleTtlMs <= 0) return;
    idleTimer = setTimeout(() => {
      void close();
    }, idleTtlMs);
    idleTimer.unref();
  };

  const detach = async (connection: ConnectionState): Promise<void> => {
    if (!connection.sessionKeyHash) return;
    if (activeSessions.get(connection.sessionKeyHash) === connection) {
      activeSessions.delete(connection.sessionKeyHash);
      try {
        await registry.close(connection.sessionKeyHash);
      } catch {
        // Socket teardown must not be blocked by retained-state diagnostics.
      }
    }
    connection.sessionHandle = undefined;
    connection.sessionKeyHash = undefined;
  };

  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    if (idleTimer) clearTimeout(idleTimer);
    await Promise.all([...connections].map((connection) => detach(connection)));
    for (const connection of connections) connection.socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    removeOwnedState(registry.runtimeRoot, token);
  };

  server.on("connection", (socket) => {
    socket.setEncoding("utf-8");
    const connection: ConnectionState = {
      socket,
      buffer: "",
      chain: Promise.resolve(),
    };
    connections.add(connection);
    if (idleTimer) clearTimeout(idleTimer);
    socket.on("data", (chunk) => {
      connection.buffer += String(chunk);
      if (Buffer.byteLength(connection.buffer, "utf-8") > MAX_PROTOCOL_LINE_BYTES) {
        socket.destroy(new Error("Session protocol frame exceeds the 1 MiB limit."));
        return;
      }
      while (true) {
        const lineEnd = connection.buffer.indexOf("\n");
        if (lineEnd < 0) break;
        const line = connection.buffer.slice(0, lineEnd).trim();
        connection.buffer = connection.buffer.slice(lineEnd + 1);
        if (!line) continue;
        connection.chain = connection.chain.then(async () => {
          const response = await handleLine(line, connection);
          if (!socket.destroyed) socket.write(`${JSON.stringify(response)}\n`);
          if (
            response.ok
            && JSON.parse(line).operation === "session.close"
            && !socket.destroyed
          ) {
            socket.end();
          }
        }).catch(() => {
          socket.destroy();
        });
      }
    });
    socket.on("close", () => {
      connections.delete(connection);
      void detach(connection).finally(scheduleIdle);
    });
    socket.on("error", () => {
      // close owns retained state cleanup.
    });
  });

  const handleLine = async (
    line: string,
    connection: ConnectionState,
  ): Promise<SessionProtocolResponse> => {
    let request: SessionProtocolRequest;
    try {
      request = JSON.parse(line) as SessionProtocolRequest;
    } catch {
      return errorResponse("", "SESSION_PROTOCOL_INVALID", "Invalid JSONL request.");
    }
    if (request.protocolVersion !== SESSION_PROTOCOL_VERSION) {
      return errorResponse(request.requestId, "SESSION_PROTOCOL_UNSUPPORTED", "Unsupported session protocol version.");
    }
    if (request.token !== token) {
      return errorResponse(request.requestId, "SESSION_AUTH_FAILED", "Invalid session daemon token.");
    }
    try {
      if (request.operation === "session.open") {
        await cleanupExpiredSessions();
        await detach(connection);
        const identity = createSessionIdentity(request.input.agentSessionId, request.input.workdir);
        const active = activeSessions.get(identity.sessionKeyHash);
        if (active && active !== connection) {
          throw new ClawError("PLAN_TRANSITION_CONFLICT", "SESSION_BUSY", {
            code: "SESSION_BUSY",
            sessionKeyHash: identity.sessionKeyHash,
          });
        }
        await registry.open(
          request.input.agentSessionId,
          request.input.workdir,
          request.input.client,
        );
        connection.sessionHandle = randomUUID();
        connection.sessionKeyHash = identity.sessionKeyHash;
        connection.agentSessionId = identity.agentSessionId;
        connection.canonicalWorkdir = identity.canonicalWorkdir;
        connection.focusKey = sessionFocusKey(identity);
        connection.host = request.input.client.host;
        activeSessions.set(identity.sessionKeyHash, connection);
        try {
          const project = resolveProjectContext(identity.canonicalWorkdir);
          await recoverProjectFocusTransitions({ project, sessionStore: focusStore });
        } catch (error) {
          if (error instanceof ClawError && error.code === "FOCUS_RECOVERY_CONFLICT") throw error;
        }
        await service.reconcileCanonicalFocus({
          cwd: identity.canonicalWorkdir,
          agentSessionId: identity.agentSessionId,
          sessionKey: sessionFocusKey(identity),
          host: request.input.client.host,
          mode: "session",
        });
        const sessionRecord = registry.read(identity.sessionKeyHash);
        const currentPlan = sessionRecord.currentPlan
          ? (await service.execute({
              cwd: identity.canonicalWorkdir,
              agentSessionId: identity.agentSessionId,
              sessionKey: sessionFocusKey(identity),
              host: request.input.client.host,
              mode: "session",
            }, {
              operation: "plan.show",
              input: { simple: true },
            })).output
          : undefined;
        return successResponse(request.requestId, {
          sessionHandle: connection.sessionHandle,
          session: sessionRecord,
          ...(currentPlan ? { currentPlan } : {}),
        });
      }
      assertAttached(request, connection);
      if (request.operation === "session.status") {
        return successResponse(request.requestId, {
          session: registry.read(connection.sessionKeyHash!),
          daemon: {
            schemaVersion: state.schemaVersion,
            protocolVersion: state.protocolVersion,
            pid: state.pid,
            host: state.host,
            port: state.port,
            startedAt: state.startedAt,
          },
        });
      }
      if (request.operation === "session.close") {
        const closed = await registry.close(connection.sessionKeyHash!);
        activeSessions.delete(connection.sessionKeyHash!);
        connection.sessionKeyHash = undefined;
        return successResponse(request.requestId, { session: closed });
      }
      const result = await service.execute({
        cwd: connection.canonicalWorkdir!,
        agentSessionId: connection.agentSessionId,
        sessionKey: connection.focusKey,
        host: connection.host,
        mode: "session",
      }, request.input as { operation: string; input: unknown });
      await registry.touch(connection.sessionKeyHash!);
      return successResponse(request.requestId, {
        schemaVersion: 1,
        output: result.output,
        ...(result.hostActions?.length ? { hostActions: result.hostActions } : {}),
        ...(result.postCommitEffects?.length ? { postCommitEffects: result.postCommitEffects } : {}),
        ...(result.knowledgeDispatch ? { knowledgeDispatch: result.knowledgeDispatch } : {}),
      });
    } catch (error) {
      if (error instanceof ClawError) {
        const code = error.details?.code === "SESSION_BUSY"
          ? "SESSION_BUSY"
          : SESSION_PASSTHROUGH_ERRORS.has(error.code)
            ? error.code
            : "SESSION_COMMAND_FAILED";
        return errorResponse(request.requestId, code, error.message, {
          ...(error.details ?? {}),
          ...(code === "SESSION_COMMAND_FAILED" ? { coreCode: error.code } : {}),
        });
      }
      return errorResponse(
        request.requestId,
        "SESSION_INTERNAL_ERROR",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Session daemon failed to bind a loopback TCP port.");
  }
  const state: SessionDaemonState = {
    schemaVersion: 1,
    protocolVersion: SESSION_PROTOCOL_VERSION,
    pid: process.pid,
    host: "127.0.0.1",
    port: address.port,
    token,
    startedAt: new Date().toISOString(),
  };
  const statePath = path.join(registry.runtimeRoot, "daemon", "state.json");
  writeJsonFileAtomic(statePath, state);
  try {
    fs.chmodSync(statePath, 0o600);
  } catch {
    // Windows ACLs are inherited from the user runtime directory.
  }
  releaseStartLock();
  scheduleIdle();
  return { state, close };
}

function assertAttached(
  request: Exclude<SessionProtocolRequest, { operation: "session.open" }>,
  connection: ConnectionState,
): void {
  if (!connection.sessionHandle || request.sessionHandle !== connection.sessionHandle) {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", "Invalid or closed session handle.", {
      code: "SESSION_HANDLE_INVALID",
    });
  }
}

function successResponse(requestId: string, output: unknown): SessionProtocolResponse {
  return { ok: true, requestId, output };
}

function errorResponse(
  requestId: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): SessionProtocolResponse {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
      retryable: code === "SESSION_BUSY",
      outcome: "known",
      ...(details ? { details } : {}),
    },
  };
}

function acquireStartLock(runtimeRoot: string): () => void {
  const lockPath = path.join(runtimeRoot, "daemon", "start.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      const owner = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as { pid?: number };
      if (owner.pid && isProcessAlive(owner.pid)) {
        throw new Error("Another session daemon is starting.");
      }
      fs.unlinkSync(lockPath);
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), { flag: "wx" });
    } catch (nested) {
      throw nested;
    }
  }
  return () => {
    try {
      const owner = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as { pid?: number };
      if (owner.pid === process.pid) fs.unlinkSync(lockPath);
    } catch {
      // Already released.
    }
  };
}

function removeOwnedState(runtimeRoot: string, token: string): void {
  const statePath = path.join(runtimeRoot, "daemon", "state.json");
  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as SessionDaemonState;
    if (state.token === token) fs.unlinkSync(statePath);
  } catch {
    // Discovery state is already absent or belongs to a replacement daemon.
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
