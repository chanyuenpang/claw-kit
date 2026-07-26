import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  EMBEDDING_DAEMON_MAX_MESSAGE_BYTES,
  EMBEDDING_DAEMON_PROTOCOL_VERSION,
  createEmbeddingDaemonToken,
  removeStateIfOwned,
  writeEmbeddingDaemonState,
  type EmbeddingDaemonRequest,
  type EmbeddingDaemonResponse,
  type EmbeddingDaemonWorkerOutput,
} from "./embedding-daemon-protocol.js";
import {
  createConfiguredLocalEmbeddingSession,
  resolveConfiguredLocalEmbeddingFingerprint,
  resolveEmbeddingDimensions,
} from "./embedding-local-runtime.js";
import type { LocalEmbeddingSession } from "./embedding-local.js";

type SessionEntry = {
  fingerprint: string;
  session: Promise<LocalEmbeddingSession>;
  queue: Promise<void>;
  lastUsedAt: number;
};

const DEFAULT_IDLE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_LIMIT = 2;
const runtimeDir = resolveRuntimeDirFromArgs(process.argv.slice(2));
const instanceId = randomBytes(16).toString("hex");
const token = createEmbeddingDaemonToken();
const idleTtlMs = readPositiveInteger(process.env.CLAW_EMBEDDING_DAEMON_IDLE_TTL_MS, DEFAULT_IDLE_TTL_MS);
const sessionLimit = readPositiveInteger(process.env.CLAW_EMBEDDING_DAEMON_SESSION_LIMIT, DEFAULT_SESSION_LIMIT);
const sessions = new Map<string, SessionEntry>();
let activeRequests = 0;
let idleTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });

const server = net.createServer((socket) => {
  resetIdleTimer();
  socket.setEncoding("utf-8");
  let payload = "";
  let handled = false;
  socket.on("data", (chunk: string) => {
    if (handled) {
      return;
    }
    payload += chunk;
    if (Buffer.byteLength(payload, "utf-8") > EMBEDDING_DAEMON_MAX_MESSAGE_BYTES) {
      handled = true;
      writeResponse(socket, protocolError("", "Embedding daemon request exceeded the size limit."));
      return;
    }
    const newlineIndex = payload.indexOf("\n");
    if (newlineIndex < 0) {
      return;
    }
    handled = true;
    const raw = payload.slice(0, newlineIndex).trim();
    void handleRawRequest(raw).then((response) => writeResponse(socket, response));
  });
  socket.on("error", () => {
    // Client transport failures are isolated to the request.
  });
});

server.on("error", async (error) => {
  appendEvent("daemon.error", { message: error.message });
  await shutdown(1);
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    void shutdown(1);
    return;
  }
  writeEmbeddingDaemonState(runtimeDir, {
    protocolVersion: EMBEDDING_DAEMON_PROTOCOL_VERSION,
    instanceId,
    pid: process.pid,
    port: address.port,
    token,
    startedAt: new Date().toISOString(),
  });
  appendEvent("daemon.started", { port: address.port });
  resetIdleTimer();
});

process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(0));

async function handleRawRequest(raw: string): Promise<EmbeddingDaemonResponse> {
  let request: EmbeddingDaemonRequest;
  try {
    request = JSON.parse(raw) as EmbeddingDaemonRequest;
  } catch {
    return protocolError("", "Embedding daemon request is not valid JSON.");
  }
  if (request.protocolVersion !== EMBEDDING_DAEMON_PROTOCOL_VERSION) {
    return protocolError(request.requestId, "Embedding daemon protocol version mismatch.");
  }
  if (request.token !== token) {
    return protocolError(request.requestId, "Embedding daemon authentication failed.");
  }
  if (request.embedding?.provider !== "local" || !Array.isArray(request.texts) || !request.projectCwd) {
    return protocolError(request.requestId, "Embedding daemon request shape is invalid.");
  }

  activeRequests += 1;
  resetIdleTimer();
  try {
    const output = await runRequest(request);
    appendEvent("request.completed", {
      requestId: request.requestId,
      textCount: request.texts.length,
    });
    return { ok: true, requestId: request.requestId, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown local embedding failure.";
    appendEvent("request.failed", { requestId: request.requestId, message });
    return {
      ok: false,
      requestId: request.requestId,
      error: { kind: "model", message },
    };
  } finally {
    activeRequests -= 1;
    resetIdleTimer();
  }
}

async function runRequest(request: EmbeddingDaemonRequest): Promise<EmbeddingDaemonWorkerOutput> {
  const fingerprint = process.env.CLAW_EMBEDDING_DAEMON_TEST_MOCK === "1"
    ? createHash("sha256").update(JSON.stringify({ request: request.embedding, requestCwd: request.projectCwd })).digest("hex")
    : resolveConfiguredLocalEmbeddingFingerprint(request.embedding, request.projectCwd);
  let entry = sessions.get(fingerprint);
  if (!entry) {
    const session = process.env.CLAW_EMBEDDING_DAEMON_TEST_MOCK === "1"
      ? Promise.resolve(createMockSession(request.embedding))
      : createConfiguredLocalEmbeddingSession(request.embedding, request.projectCwd);
    entry = {
      fingerprint,
      session,
      queue: Promise.resolve(),
      lastUsedAt: Date.now(),
    };
    sessions.set(fingerprint, entry);
    appendEvent("session.created", { fingerprint });
    await evictSessions(fingerprint);
  }
  entry.lastUsedAt = Date.now();

  let release!: () => void;
  const previous = entry.queue;
  entry.queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const session = await entry.session;
    const result = await session.run(request.texts);
    return { dimensions: result.dimensions, vectors: result.vectors };
  } finally {
    release();
  }
}

async function evictSessions(activeFingerprint: string): Promise<void> {
  if (sessions.size <= sessionLimit) {
    return;
  }
  const candidates = Array.from(sessions.values())
    .filter((entry) => entry.fingerprint !== activeFingerprint)
    .sort((left, right) => left.lastUsedAt - right.lastUsedAt);
  while (sessions.size > sessionLimit && candidates.length > 0) {
    const entry = candidates.shift();
    if (!entry) {
      break;
    }
    sessions.delete(entry.fingerprint);
    const session = await entry.session;
    await entry.queue;
    await session.dispose();
    appendEvent("session.evicted", { fingerprint: entry.fingerprint });
  }
}

function createMockSession(embedding: EmbeddingDaemonRequest["embedding"]): LocalEmbeddingSession {
  const dimensions = resolveEmbeddingDimensions(embedding, 768);
  let disposed = false;
  return {
    dimensions,
    device: "cpu",
    run: async (texts) => {
      if (disposed) {
        throw new Error("Mock embedding session has been disposed.");
      }
      return {
        dimensions,
        device: "cpu",
        vectors: texts.map((text, textIndex) => buildMockVector(text, dimensions, textIndex)),
      };
    },
    dispose: async () => {
      disposed = true;
    },
  };
}

function buildMockVector(text: string, dimensions: number, textIndex: number): number[] {
  let seed = textIndex + 1;
  for (let index = 0; index < text.length; index += 1) {
    seed = (seed * 31 + text.charCodeAt(index)) % 104729;
  }
  return Array.from({ length: dimensions }, (_, index) => ((seed + index * 17) % 1000) / 1000);
}

function protocolError(requestId: string, message: string): EmbeddingDaemonResponse {
  return { ok: false, requestId, error: { kind: "protocol", message } };
}

function writeResponse(socket: net.Socket, response: EmbeddingDaemonResponse): void {
  if (!socket.destroyed) {
    socket.end(`${JSON.stringify(response)}\n`);
  }
}

function resetIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    if (activeRequests === 0) {
      void shutdown(0);
    } else {
      resetIdleTimer();
    }
  }, idleTtlMs);
  idleTimer.unref();
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const entry of sessions.values()) {
    try {
      await entry.queue;
      await (await entry.session).dispose();
    } catch {
      // Best-effort shutdown.
    }
  }
  removeStateIfOwned(runtimeDir, instanceId);
  appendEvent("daemon.stopped", { exitCode });
  process.exitCode = exitCode;
}

function appendEvent(event: string, details: Record<string, unknown>): void {
  const target = process.env.CLAW_EMBEDDING_DAEMON_EVENT_LOG?.trim();
  if (!target) {
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, `${JSON.stringify({ event, pid: process.pid, instanceId, at: Date.now(), ...details })}\n`, "utf-8");
}

function resolveRuntimeDirFromArgs(args: string[]): string {
  const index = args.indexOf("--runtime-dir");
  const value = index >= 0 ? args[index + 1] : null;
  if (!value) {
    throw new Error("Missing --runtime-dir for embedding daemon.");
  }
  return path.resolve(value);
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
