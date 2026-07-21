import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { ClawError } from "./errors.js";
import { searchMemoryAsync } from "./memory.js";
import {
  createSearchDaemonState,
  removeSearchDaemonState,
  type SearchDaemonRequest,
  type SearchDaemonResponse,
} from "./search-daemon-protocol.js";

const DEFAULT_IDLE_TTL_MS = 10 * 60 * 1000;
const runtimeDir = resolveRuntimeDir(process.argv.slice(2));
const idleTtlMs = readPositiveInteger(process.env.CLAW_SEARCH_DAEMON_IDLE_TTL_MS, DEFAULT_IDLE_TTL_MS);
let state: ReturnType<typeof createSearchDaemonState> | null = null;
let activeRequests = 0;
let idleTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

process.env.CLAW_SEARCH_DAEMON = "1";
fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });

const server = net.createServer((socket) => {
  resetIdleTimer();
  socket.setEncoding("utf-8");
  let payload = "";
  socket.on("data", (chunk: string) => {
    payload += chunk;
    const newline = payload.indexOf("\n");
    if (newline < 0) {
      return;
    }
    const raw = payload.slice(0, newline);
    payload = payload.slice(newline + 1);
    void handleRequest(raw).then((response) => socket.end(`${JSON.stringify(response)}\n`));
  });
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    void shutdown(1);
    return;
  }
  state = createSearchDaemonState(runtimeDir, address.port);
  resetIdleTimer();
});

process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(0));

async function handleRequest(raw: string): Promise<SearchDaemonResponse> {
  let request: SearchDaemonRequest;
  try {
    request = JSON.parse(raw) as SearchDaemonRequest;
  } catch {
    return errorResponse("", "PROJECT_CONFIG_INVALID", "Search daemon request is not valid JSON.");
  }
  if (!state || request.token !== state.token || request.protocolVersion !== state.protocolVersion) {
    return errorResponse(request.requestId, "PROJECT_CONFIG_INVALID", "Search daemon request authentication failed.");
  }
  activeRequests += 1;
  resetIdleTimer();
  try {
    const output = await searchMemoryAsync(request.input);
    return { ok: true, requestId: request.requestId, output };
  } catch (error) {
    return error instanceof ClawError
      ? errorResponse(request.requestId, error.code, error.message, error.details)
      : errorResponse(request.requestId, "UNEXPECTED_ERROR", error instanceof Error ? error.message : String(error));
  } finally {
    activeRequests -= 1;
    resetIdleTimer();
  }
}

function errorResponse(
  requestId: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): SearchDaemonResponse {
  return { ok: false, requestId, error: { code, message, ...(details ? { details } : {}) } };
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
  if (state) {
    removeSearchDaemonState(runtimeDir, state.instanceId);
  }
  process.exitCode = exitCode;
}

function resolveRuntimeDir(args: string[]): string {
  const index = args.indexOf("--runtime-dir");
  const value = index >= 0 ? args[index + 1] : null;
  if (!value) {
    throw new Error("Search daemon requires --runtime-dir.");
  }
  return path.resolve(value);
}

function readPositiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

