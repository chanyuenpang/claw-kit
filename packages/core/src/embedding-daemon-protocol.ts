import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MemoryEmbeddingConfig } from "./types.js";

export const EMBEDDING_DAEMON_PROTOCOL_VERSION = 1;
export const EMBEDDING_DAEMON_MAX_MESSAGE_BYTES = 10 * 1024 * 1024;

export type EmbeddingDaemonWorkerInput = {
  embedding: MemoryEmbeddingConfig;
  texts: string[];
  projectCwd: string;
};

export type EmbeddingDaemonWorkerOutput = {
  dimensions: number;
  vectors: number[][];
};

export type EmbeddingDaemonRequest = EmbeddingDaemonWorkerInput & {
  protocolVersion: number;
  requestId: string;
  token: string;
};

export type EmbeddingDaemonResponse =
  | {
      ok: true;
      requestId: string;
      output: EmbeddingDaemonWorkerOutput;
    }
  | {
      ok: false;
      requestId: string;
      error: {
        kind: "model" | "protocol";
        message: string;
      };
    };

export type EmbeddingDaemonState = {
  protocolVersion: number;
  instanceId: string;
  pid: number;
  port: number;
  token: string;
  startedAt: string;
};

export class PersistentEmbeddingModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistentEmbeddingModelError";
  }
}

const STATE_FILE_NAME = "state.json";
const START_LOCK_FILE_NAME = "startup.lock";
const DEFAULT_START_TIMEOUT_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;

export function resolveEmbeddingDaemonRuntimeDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAW_EMBEDDING_DAEMON_RUNTIME_DIR?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  const installRoot = fileURLToPath(new URL(".", import.meta.url));
  const identity = `${os.userInfo().username}\0${os.homedir()}\0${installRoot}\0${process.versions.node.split(".")[0]}\0${EMBEDDING_DAEMON_PROTOCOL_VERSION}`;
  const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), `claw-embedding-${suffix}`);
}

export function getEmbeddingDaemonStatePath(runtimeDir: string): string {
  return path.join(runtimeDir, STATE_FILE_NAME);
}

export function createEmbeddingDaemonToken(): string {
  return randomBytes(32).toString("hex");
}

export function createEmbeddingDaemonRequestId(): string {
  return randomBytes(12).toString("hex");
}

export async function requestPersistentEmbedding(
  input: EmbeddingDaemonWorkerInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EmbeddingDaemonWorkerOutput | null> {
  if (env.CLAW_EMBEDDING_PERSISTENT_WORKER === "0") {
    return null;
  }
  const runtimeDir = resolveEmbeddingDaemonRuntimeDir(env);
  fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });

  const existingState = readEmbeddingDaemonState(runtimeDir);
  if (existingState) {
    try {
      return await sendEmbeddingDaemonRequest(existingState, input, env);
    } catch (error) {
      if (error instanceof PersistentEmbeddingModelError) {
        throw error;
      }
      removeStateIfOwned(runtimeDir, existingState.instanceId);
    }
  }

  const startTimeoutMs = readPositiveInteger(env.CLAW_EMBEDDING_DAEMON_START_TIMEOUT_MS, DEFAULT_START_TIMEOUT_MS);
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
      const daemonPath = fileURLToPath(new URL("./embedding-daemon.js", import.meta.url));
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
      const state = readEmbeddingDaemonState(runtimeDir);
      if (state) {
        try {
          return await sendEmbeddingDaemonRequest(state, input, env);
        } catch (error) {
          if (error instanceof PersistentEmbeddingModelError) {
            throw error;
          }
        }
      }
      await delay(50);
    }
    return null;
  } finally {
    if (ownsLock) {
      fs.rmSync(lockPath, { force: true });
    }
  }
}

export function readEmbeddingDaemonState(runtimeDir: string): EmbeddingDaemonState | null {
  try {
    const state = JSON.parse(fs.readFileSync(getEmbeddingDaemonStatePath(runtimeDir), "utf-8")) as EmbeddingDaemonState;
    if (
      state.protocolVersion !== EMBEDDING_DAEMON_PROTOCOL_VERSION
      || !Number.isInteger(state.port)
      || state.port <= 0
      || !state.token
      || !state.instanceId
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function writeEmbeddingDaemonState(runtimeDir: string, state: EmbeddingDaemonState): void {
  const target = getEmbeddingDaemonStatePath(runtimeDir);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(temporary, target);
}

export function removeStateIfOwned(runtimeDir: string, instanceId: string): void {
  const current = readEmbeddingDaemonState(runtimeDir);
  if (current?.instanceId === instanceId) {
    fs.rmSync(getEmbeddingDaemonStatePath(runtimeDir), { force: true });
  }
}

async function sendEmbeddingDaemonRequest(
  state: EmbeddingDaemonState,
  input: EmbeddingDaemonWorkerInput,
  env: NodeJS.ProcessEnv,
): Promise<EmbeddingDaemonWorkerOutput> {
  const requestId = createEmbeddingDaemonRequestId();
  const request: EmbeddingDaemonRequest = {
    ...input,
    protocolVersion: EMBEDDING_DAEMON_PROTOCOL_VERSION,
    requestId,
    token: state.token,
  };
  const timeoutMs = readPositiveInteger(env.CLAW_EMBEDDING_DAEMON_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS);
  const response = await new Promise<EmbeddingDaemonResponse>((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: state.port });
    let payload = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Persistent embedding daemon request timed out."));
    }, timeoutMs);
    socket.setEncoding("utf-8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on("data", (chunk: string) => {
      payload += chunk;
      if (Buffer.byteLength(payload, "utf-8") > EMBEDDING_DAEMON_MAX_MESSAGE_BYTES) {
        socket.destroy(new Error("Persistent embedding daemon response exceeded the size limit."));
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("end", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(payload.trim()) as EmbeddingDaemonResponse);
      } catch (error) {
        reject(error);
      }
    });
  });
  if (!response.ok) {
    if (response.error.kind === "model") {
      throw new PersistentEmbeddingModelError(response.error.message);
    }
    throw new Error(response.error.message);
  }
  if (response.requestId !== requestId) {
    throw new Error("Persistent embedding daemon returned a mismatched request id.");
  }
  return response.output;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
