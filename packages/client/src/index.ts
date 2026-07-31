import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  SESSION_PROTOCOL_VERSION,
  type ClawSessionCommand,
  type ClawSessionCommandEnvelope,
  type ClawSessionCommandResult,
  type SessionClientInfo,
  type SessionDaemonState,
  type SessionProtocolRequest,
  type SessionProtocolResponse,
} from "./protocol.js";
import { resolveSessionDaemonRuntimeRoot } from "./runtime.js";

export * from "./protocol.js";
export * from "./runtime.js";

const MAX_PROTOCOL_LINE_BYTES = 1024 * 1024;

export class ClawSessionError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly outcome: "known" | "unknown";
  readonly recoveryCommand?: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    outcome: "known" | "unknown";
    recoveryCommand?: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "ClawSessionError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.outcome = input.outcome;
    this.recoveryCommand = input.recoveryCommand;
    this.details = input.details;
  }
}

export type ClawClientOptions = {
  runtimeRoot?: string;
  daemonEntryPath?: string;
  host?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  clientKind?: SessionClientInfo["kind"];
};

export class ClawClient {
  readonly runtimeRoot: string;
  readonly daemonEntryPath?: string;
  readonly host?: string;
  readonly startupTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly clientKind: SessionClientInfo["kind"];

  constructor(options: ClawClientOptions = {}) {
    this.runtimeRoot = path.resolve(options.runtimeRoot ?? resolveSessionDaemonRuntimeRoot());
    this.daemonEntryPath = options.daemonEntryPath;
    this.host = options.host;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 5000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.clientKind = options.clientKind ?? "node";
  }

  async open(agentSessionId: string, workdir: string): Promise<ClawSession> {
    const startedAt = performance.now();
    const warm = Boolean(readDaemonState(this.runtimeRoot));
    const canonicalWorkdir = path.resolve(workdir);
    const connection = await this.connectOrStart();
    try {
      const output = await connection.request({
        protocolVersion: SESSION_PROTOCOL_VERSION,
        requestId: randomUUID(),
        token: connection.state.token,
        operation: "session.open",
        input: {
          agentSessionId,
          workdir: canonicalWorkdir,
          client: {
            kind: this.clientKind,
            ...(this.host ? { host: this.host } : {}),
          },
        },
      }) as { sessionHandle: string; session: unknown; currentPlan?: unknown };
      return new ClawSession(connection, output.sessionHandle, {
        ...output,
        telemetry: {
          open: warm ? "warm" : "cold",
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
        },
      }, agentSessionId, canonicalWorkdir);
    } catch (error) {
      connection.close();
      throw withExactRecovery(error, agentSessionId, canonicalWorkdir);
    }
  }

  private async connectOrStart(): Promise<JsonlConnection> {
    const existing = readDaemonState(this.runtimeRoot);
    if (existing) {
      try {
        return await JsonlConnection.connect(existing, this.requestTimeoutMs);
      } catch {
        // Stale discovery is replaced only by a successfully started daemon.
      }
    }
    const daemonEntryPath = this.daemonEntryPath ?? await resolveDefaultDaemonEntry();
    const child = spawn(process.execPath, [daemonEntryPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        CLAW_SESSION_DAEMON_RUNTIME_DIR: this.runtimeRoot,
      },
    });
    child.unref();
    const deadline = Date.now() + this.startupTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      await delay(25);
      const state = readDaemonState(this.runtimeRoot);
      if (!state) continue;
      try {
        return await JsonlConnection.connect(state, this.requestTimeoutMs);
      } catch (error) {
        lastError = error;
      }
    }
    throw new ClawSessionError({
      code: "SESSION_DAEMON_UNAVAILABLE",
      message: `Timed out starting the claw session daemon${lastError ? `: ${String(lastError)}` : "."}`,
      retryable: true,
      outcome: "known",
    });
  }
}

export class ClawSession {
  readonly sessionHandle: string;
  readonly openResult: unknown;
  private readonly connection: JsonlConnection;

  constructor(
    connection: JsonlConnection,
    sessionHandle: string,
    openResult: unknown,
    private readonly agentSessionId: string,
    private readonly workdir: string,
  ) {
    this.connection = connection;
    this.sessionHandle = sessionHandle;
    this.openResult = openResult;
  }

  async command<T extends ClawSessionCommand>(input: T): Promise<ClawSessionCommandResult<T>> {
    return (await this.commandEnvelope(input)).output;
  }

  async commandEnvelope<T extends ClawSessionCommand>(input: T): Promise<ClawSessionCommandEnvelope<T>> {
    try {
      return await this.connection.request({
        protocolVersion: SESSION_PROTOCOL_VERSION,
        requestId: randomUUID(),
        token: this.connection.state.token,
        operation: "session.command",
        sessionHandle: this.sessionHandle,
        input,
      }) as ClawSessionCommandEnvelope<T>;
    } catch (error) {
      throw withExactRecovery(error, this.agentSessionId, this.workdir);
    }
  }

  status<T = unknown>(): Promise<T> {
    return this.connection.request({
      protocolVersion: SESSION_PROTOCOL_VERSION,
      requestId: randomUUID(),
      token: this.connection.state.token,
      operation: "session.status",
      sessionHandle: this.sessionHandle,
      input: {},
    }).catch((error) => {
      throw withExactRecovery(error, this.agentSessionId, this.workdir);
    }) as Promise<T>;
  }

  async close(): Promise<void> {
    try {
      await this.connection.request({
        protocolVersion: SESSION_PROTOCOL_VERSION,
        requestId: randomUUID(),
        token: this.connection.state.token,
        operation: "session.close",
        sessionHandle: this.sessionHandle,
        input: {},
      }).catch((error) => {
        throw withExactRecovery(error, this.agentSessionId, this.workdir);
      });
    } finally {
      this.connection.close();
    }
  }
}

export const session = {
  open(
    agentSessionId: string,
    workdir: string,
    options?: ClawClientOptions,
  ): Promise<ClawSession> {
    return new ClawClient(options).open(agentSessionId, workdir);
  },
};

class JsonlConnection {
  readonly socket: net.Socket;
  readonly state: SessionDaemonState;
  private buffer = "";
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void; timer: NodeJS.Timeout }
  >();
  private closed = false;
  private readonly requestTimeoutMs: number;

  private constructor(socket: net.Socket, state: SessionDaemonState, requestTimeoutMs: number) {
    this.socket = socket;
    this.state = state;
    this.requestTimeoutMs = requestTimeoutMs;
    socket.setEncoding("utf-8");
    socket.on("data", (chunk) => this.consume(String(chunk)));
    socket.on("error", (error) => this.failPending(error));
    socket.on("close", () => this.failPending(new Error("Session daemon connection closed.")));
  }

  static connect(state: SessionDaemonState, requestTimeoutMs: number): Promise<JsonlConnection> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: state.host, port: state.port });
      const onError = (error: Error) => reject(error);
      socket.once("error", onError);
      socket.once("connect", () => {
        socket.off("error", onError);
        resolve(new JsonlConnection(socket, state, requestTimeoutMs));
      });
    });
  }

  request(request: SessionProtocolRequest): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(disconnectedError());
    }
    return new Promise((resolve, reject) => {
      const frame = `${JSON.stringify(request)}\n`;
      if (Buffer.byteLength(frame, "utf-8") > MAX_PROTOCOL_LINE_BYTES) {
        reject(new ClawSessionError({
          code: "SESSION_REQUEST_TOO_LARGE",
          message: "The claw session request exceeds the 1 MiB protocol limit.",
          retryable: false,
          outcome: "known",
        }));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(new ClawSessionError({
          code: "SESSION_REQUEST_TIMEOUT",
          message: "The claw session request timed out; its outcome is unknown.",
          retryable: false,
          outcome: "unknown",
        }));
      }, this.requestTimeoutMs);
      timer.unref();
      this.pending.set(request.requestId, { resolve, reject, timer });
      this.socket.write(frame, (error) => {
        if (!error) return;
        const pending = this.pending.get(request.requestId);
        if (pending) clearTimeout(pending.timer);
        this.pending.delete(request.requestId);
        reject(disconnectedError(error));
      });
    });
  }

  close(): void {
    this.closed = true;
    this.socket.destroy();
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, "utf-8") > MAX_PROTOCOL_LINE_BYTES) {
      this.failPending(new Error("Session protocol response exceeds the 1 MiB limit."));
      this.socket.destroy();
      return;
    }
    while (true) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd < 0) return;
      const line = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (!line) continue;
      let response: SessionProtocolResponse;
      try {
        response = JSON.parse(line) as SessionProtocolResponse;
      } catch {
        this.failPending(new Error("Session daemon returned invalid JSONL."));
        return;
      }
      const pending = this.pending.get(response.requestId);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(response.requestId);
      if (response.ok) {
        pending.resolve(response.output);
      } else {
        pending.reject(new ClawSessionError(response.error));
      }
    }
  }

  private failPending(cause: unknown): void {
    if (this.closed && this.pending.size === 0) return;
    this.closed = true;
    const error = disconnectedError(cause);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function readDaemonState(runtimeRoot: string): SessionDaemonState | null {
  try {
    const state = JSON.parse(
      fs.readFileSync(path.join(runtimeRoot, "daemon", "state.json"), "utf-8"),
    ) as SessionDaemonState;
    return state.schemaVersion === 1
      && state.protocolVersion === SESSION_PROTOCOL_VERSION
      && state.host === "127.0.0.1"
      && Number.isInteger(state.port)
      && typeof state.token === "string"
      ? state
      : null;
  } catch {
    return null;
  }
}

async function resolveDefaultDaemonEntry(): Promise<string> {
  try {
    return fileURLToPath(await import.meta.resolve("@veewo/claw/session-daemon"));
  } catch {
    throw new ClawSessionError({
      code: "SESSION_DAEMON_ENTRY_MISSING",
      message: "The @veewo/claw session daemon entry is not installed.",
      retryable: false,
      outcome: "known",
    });
  }
}

function disconnectedError(cause?: unknown): ClawSessionError {
  return new ClawSessionError({
    code: "SESSION_CONNECTION_LOST",
    message: "The claw session connection was interrupted. Run `claw session open <dir> <session-id>` to reconnect, then inspect the current plan.",
    retryable: false,
    outcome: "unknown",
    recoveryCommand: "claw session open <dir> <session-id>",
    ...(cause ? { details: { cause: String(cause) } } : {}),
  });
}

function withExactRecovery(error: unknown, agentSessionId: string, workdir: string): unknown {
  if (!(error instanceof ClawSessionError) || error.outcome !== "unknown") return error;
  const recoveryCommand = `claw session open ${quoteCliArg(workdir)} ${quoteCliArg(agentSessionId)}`;
  return new ClawSessionError({
    code: error.code,
    message: `${error.message.replace(/\s*Run `claw session open <dir> <session-id>`.*$/u, "")} Run \`${recoveryCommand}\` to reconnect, then use \`plan show --simple\` to inspect the current plan.`,
    retryable: false,
    outcome: "unknown",
    recoveryCommand,
    ...(error.details ? { details: error.details } : {}),
  });
}

function quoteCliArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
