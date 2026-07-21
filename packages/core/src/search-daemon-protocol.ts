import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClawError, type ClawErrorCode } from "./errors.js";
import type { MemorySearchInput, MemorySearchResult } from "./types.js";

const SEARCH_DAEMON_PROTOCOL_VERSION = 1;
const STATE_FILE_NAME = "state.json";
const START_LOCK_FILE_NAME = "startup.lock";
const DEFAULT_START_TIMEOUT_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

type SearchDaemonState = {
  protocolVersion: number;
  instanceId: string;
  pid: number;
  port: number;
  token: string;
};

export type SearchDaemonRequest = {
  protocolVersion: number;
  requestId: string;
  token: string;
  input: MemorySearchInput;
};

export type SearchDaemonResponse =
  | { ok: true; requestId: string; output: MemorySearchResult }
  | {
      ok: false;
      requestId: string;
      error: { code: string; message: string; details?: Record<string, unknown> };
    };

export async function requestPersistentSearch(
  input: MemorySearchInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MemorySearchResult | null> {
  if (env.CLAW_SEARCH_PERSISTENT_READER === "0") {
    return null;
  }
  const runtimeDir = resolveSearchDaemonRuntimeDir(env);
  fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
  const existing = readState(runtimeDir);
  if (existing) {
    try {
      return await sendRequest(existing, input, env);
    } catch (error) {
      if (error instanceof ClawError) {
        throw error;
      }
      removeStateIfOwned(runtimeDir, existing.instanceId);
    }
  }

  const startTimeoutMs = readPositiveInteger(env.CLAW_SEARCH_DAEMON_START_TIMEOUT_MS, DEFAULT_START_TIMEOUT_MS);
  const lockPath = path.join(runtimeDir, START_LOCK_FILE_NAME);
  let ownsLock = false;
  try {
    try {
      const fd = fs.openSync(lockPath, "wx", 0o600);
      fs.closeSync(fd);
      ownsLock = true;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") {
        return null;
      }
      const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (ageMs > startTimeoutMs * 2) {
        fs.rmSync(lockPath, { force: true });
        const fd = fs.openSync(lockPath, "wx", 0o600);
        fs.closeSync(fd);
        ownsLock = true;
      }
    }
    if (ownsLock) {
      const daemonPath = fileURLToPath(new URL("./search-daemon.js", import.meta.url));
      const child = spawn(process.execPath, [daemonPath, "--runtime-dir", runtimeDir], {
        detached: true,
        env,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
    }
    const deadline = Date.now() + startTimeoutMs;
    while (Date.now() < deadline) {
      const state = readState(runtimeDir);
      if (state) {
        try {
          return await sendRequest(state, input, env);
        } catch (error) {
          if (error instanceof ClawError) {
            throw error;
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  } finally {
    if (ownsLock) {
      fs.rmSync(lockPath, { force: true });
    }
  }
}

export function resolveSearchDaemonRuntimeDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAW_SEARCH_DAEMON_RUNTIME_DIR?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  const embeddingRuntimeDir = env.CLAW_EMBEDDING_DAEMON_RUNTIME_DIR?.trim();
  if (embeddingRuntimeDir) {
    return path.join(path.resolve(embeddingRuntimeDir), "search-reader");
  }
  const installRoot = fileURLToPath(new URL(".", import.meta.url));
  const identity = `${os.userInfo().username}\0${os.homedir()}\0${installRoot}\0${process.versions.node.split(".")[0]}\0${SEARCH_DAEMON_PROTOCOL_VERSION}`;
  const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), `claw-search-${suffix}`);
}

export function createSearchDaemonState(runtimeDir: string, port: number): SearchDaemonState {
  const state = {
    protocolVersion: SEARCH_DAEMON_PROTOCOL_VERSION,
    instanceId: randomBytes(16).toString("hex"),
    pid: process.pid,
    port,
    token: randomBytes(32).toString("hex"),
  };
  const target = path.join(runtimeDir, STATE_FILE_NAME);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(temporary, target);
  return state;
}

export function removeSearchDaemonState(runtimeDir: string, instanceId: string): void {
  removeStateIfOwned(runtimeDir, instanceId);
}

function readState(runtimeDir: string): SearchDaemonState | null {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(runtimeDir, STATE_FILE_NAME), "utf-8")) as SearchDaemonState;
    return state.protocolVersion === SEARCH_DAEMON_PROTOCOL_VERSION && state.port > 0 && state.token
      ? state
      : null;
  } catch {
    return null;
  }
}

function removeStateIfOwned(runtimeDir: string, instanceId: string): void {
  const current = readState(runtimeDir);
  if (current?.instanceId === instanceId) {
    fs.rmSync(path.join(runtimeDir, STATE_FILE_NAME), { force: true });
  }
}

function sendRequest(
  state: SearchDaemonState,
  input: MemorySearchInput,
  env: NodeJS.ProcessEnv,
): Promise<MemorySearchResult> {
  const requestId = randomBytes(12).toString("hex");
  const request: SearchDaemonRequest = {
    protocolVersion: SEARCH_DAEMON_PROTOCOL_VERSION,
    requestId,
    token: state.token,
    input,
  };
  const timeoutMs = readPositiveInteger(env.CLAW_SEARCH_DAEMON_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: state.port });
    let payload = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Persistent search request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    socket.setEncoding("utf-8");
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: string) => {
      payload += chunk;
      const newline = payload.indexOf("\n");
      if (newline < 0) {
        return;
      }
      clearTimeout(timer);
      socket.end();
      try {
        const response = JSON.parse(payload.slice(0, newline)) as SearchDaemonResponse;
        if (!response.ok) {
          reject(new ClawError(
            response.error.code as ClawErrorCode,
            response.error.message,
            response.error.details,
          ));
          return;
        }
        resolve(response.output);
      } catch (error) {
        reject(error);
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function readPositiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
