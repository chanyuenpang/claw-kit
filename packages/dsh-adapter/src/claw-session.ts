import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";

/**
 * Minimal typed view of the DSH `subprocess` service surface used here
 * (`ctx.get("subprocess")`). Kept structural so the adapter does not depend
 * on @deepseek-ai/dsh-subprocess-local types.
 */
export type SubprocessLike = {
  spawn(spec: {
    argv: string[];
    cwd?: string;
    env?: Record<string, string>;
    stdio: {
      stdin: "pipe" | "ignore" | "inherit";
      stdout: "pipe" | "ignore" | "inherit" | { mode: "collect"; maxBytes: number; spill?: { maxBytes: number } };
      stderr: "pipe" | "ignore" | "inherit" | { mode: "collect"; maxBytes: number; spill?: { maxBytes: number } };
    };
    graceMs?: number;
    signal?: AbortSignal;
  }): SubprocessHandleLike;
};

export type SubprocessHandleLike = {
  readonly stdin?: { write(data: string): boolean };
  readonly stdout?: Readable;
  readonly stderr?: Readable;
  readonly collected?: {
    stdout?: { finalize(): { text: string } };
    stderr?: { finalize(): { text: string } };
  };
  readonly done: Promise<unknown>;
  terminate(reason?: string): Promise<unknown>;
};

/** One `claw/execute` protocol response (daemon, schemaVersion 1). */
export type ClawExecuteResult = {
  ok: boolean;
  command: string;
  schemaVersion?: number;
  output?: Record<string, unknown>;
  hostActions?: Array<Record<string, unknown>>;
  knowledgeDispatch?: unknown;
  postCommitEffects?: unknown[];
  error?: { code?: string; message?: string };
};

function protocolError(code: string, message: string): Error {
  const error = new Error(message);
  (error as Error & { code?: string }).code = code;
  return error;
}

function sessionOpenFailure(stderr: string, fallback: string): Error {
  const diagnostic = stderr.trim();
  if (!diagnostic) return protocolError("CLAW_SESSION_OPEN_FAILED", fallback);
  try {
    const parsed = JSON.parse(diagnostic) as { error?: { code?: unknown; message?: unknown } };
    const code = typeof parsed.error?.code === "string" ? parsed.error.code : undefined;
    const message = typeof parsed.error?.message === "string" ? parsed.error.message : undefined;
    if (message) {
      return protocolError(
        "CLAW_SESSION_OPEN_FAILED",
        "claw session open failed" + (code ? " [" + code + "]" : "") + ": " + message,
      );
    }
  } catch {
    // Preserve non-JSON CLI diagnostics below.
  }
  return protocolError("CLAW_SESSION_OPEN_FAILED", "claw session open failed: " + diagnostic.slice(-4096));
}

/**
 * Resolve a direct "node <claw>/dist/bin.js" invocation on Windows by locating
 * the "claw.cmd" shim on PATH and checking for the adjacent npm package
 * layout. Spawning node directly lets terminate() kill the real child instead
 * of only the cmd.exe wrapper — the wrapper-only kill used to orphan the node
 * process tree on every open timeout. Returns null when the layout cannot be
 * resolved; callers then fall back to the legacy cmd.exe shape.
 */
export function resolveDirectClawInvocation(options: {
  clawBinary: string;
  pathValue: string | undefined;
  nodeExecutable: string;
  exists: (candidate: string) => boolean;
}): { executable: string; script: string } | null {
  const { clawBinary, pathValue, nodeExecutable, exists } = options;
  if (!pathValue) return null;
  for (const dir of pathValue.split(";")) {
    const trimmed = dir.trim().replace(/^"|"$/g, "");
    if (!trimmed) continue;
    if (!exists(path.join(trimmed, clawBinary + ".cmd"))) continue;
    const script = path.join(trimmed, "node_modules", "@veewo", "claw", "dist", "bin.js");
    if (exists(script)) {
      return { executable: nodeExecutable, script };
    }
  }
  return null;
}

/**
 * A persistent `claw session open <workdir> <sessionId> --host dsh` JSON-RPC
 * connection over stdio, owned by one DSH session. Mirrors the Cindy
 * adapter's NativeClawSession, including the Windows `.cmd` invocation shape.
 */
export class ClawSession {
  private handle: SubprocessHandleLike | null = null;
  private buffer = "";
  private stderrBuffer = "";
  private pending: {
    resolve: (value: ClawExecuteResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private openPromise: Promise<void> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private windowsEntry: { executable: string; script: string } | null | undefined;

  constructor(
    private readonly subprocess: SubprocessLike,
    private readonly workdir: string,
    private readonly sessionId: string,
    private readonly clawBinary = "claw",
    private readonly openTimeoutMs = 15000,
  ) {}

  private invocation(argv: string[]): { executable: string; args: string[] } {
    if (process.platform === "win32") {
      if (this.windowsEntry === undefined) {
        this.windowsEntry = resolveDirectClawInvocation({
          clawBinary: this.clawBinary,
          pathValue: process.env.PATH,
          nodeExecutable: process.execPath,
          exists: (candidate) => fs.existsSync(candidate),
        });
      }
      if (this.windowsEntry) {
        return { executable: this.windowsEntry.executable, args: [this.windowsEntry.script, ...argv] };
      }
      return {
        executable: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", this.clawBinary + ".cmd", ...argv],
      };
    }
    return { executable: this.clawBinary, args: argv };
  }

  open(): Promise<void> {
    if (this.openPromise) return this.openPromise;
    this.openPromise = new Promise<void>((resolve, reject) => {
      const { executable, args } = this.invocation([
        "session", "open", this.workdir, this.sessionId, "--host", "dsh",
      ]);
      const handle = this.subprocess.spawn({
        argv: [executable, ...args],
        cwd: this.workdir,
        env: { CLAW_SESSION_ID: this.sessionId },
        stdio: {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        },
        graceMs: 8000,
      });
      this.handle = handle;
      const reset = () => {
        // A failed open must not poison the cached promise: the next request
        // gets a fresh spawn instead of a dead handle.
        if (this.handle === handle) this.handle = null;
        this.openPromise = null;
        this.pending = null;
      };
      if (handle.stdout === undefined) {
        reset();
        void handle.terminate("pipe unavailable");
        reject(protocolError("SESSION_CONNECTION_LOST", "claw session pipe unavailable."));
        return;
      }
      // Stream the pipe with plain 'data' events + line buffering. The DSH
      // subprocess seam hands back the raw child stdout, and readline-style
      // consumers were observed to miss lines on it; data events are reliable.
      this.buffer = "";
      this.stderrBuffer = "";
      handle.stdout.on("data", (chunk: unknown) => this.ingest(String(chunk)));
      handle.stderr?.on("data", (chunk: unknown) => {
        this.stderrBuffer = (this.stderrBuffer + String(chunk)).slice(-131072);
      });
      const timer = setTimeout(() => {
        // Reject the pending open BEFORE reset() clears this.pending. A
        // startup diagnostic is a deterministic failure, not a timeout.
        const error = this.stderrBuffer.trim()
          ? sessionOpenFailure(this.stderrBuffer, "claw session exited before the handshake.")
          : protocolError("CLAW_SESSION_OPEN_TIMEOUT", "claw session open timed out.");
        this.failPending(error);
        reset();
        void handle.terminate("open timeout");
      }, this.openTimeoutMs);
      this.pending = {
        resolve: (value) => {
          clearTimeout(timer);
          if (!value.ok || value.command !== "session.open") {
            reset();
            void handle.terminate("open failed");
            reject(protocolError("CLAW_SESSION_OPEN_FAILED", `claw session open failed: ${value.command ?? "unknown"}`));
            return;
          }
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reset();
          reject(error);
        },
        timer,
      };
      void handle.done.then(
        async (outcome: unknown) => {
          if (this.handle !== handle) return;
          // Let the stderr stream deliver its final buffered chunk before
          // classifying the resolved child exit.
          await new Promise<void>((resolveDrain) => setImmediate(resolveDrain));
          if (this.handle !== handle) return;
          // DSH reports normal and non-zero exits through the resolved done
          // outcome. Either one before a handshake is an immediate failure.
          const suffix = outcome && typeof outcome === "object" && "code" in outcome
            ? " (exit code " + String((outcome as { code?: unknown }).code) + ")"
            : "";
          this.failPending(sessionOpenFailure(
            this.stderrBuffer,
            "claw session exited before the handshake" + suffix + ".",
          ));
          reset();
        },
        (error: unknown) => {
          if (this.handle !== handle) return;
          // Reject before reset clears the pending slot.
          this.failPending(this.stderrBuffer.trim()
            ? sessionOpenFailure(this.stderrBuffer, "claw session exited before the handshake.")
            : error instanceof Error ? error : new Error(String(error)));
          reset();
        },
      );
    });
    return this.openPromise;
  }

  /** Consume raw stream chunks, splitting protocol JSON on newlines. */
  private ingest(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      this.consume(line);
    }
  }

  private consume(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let value: ClawExecuteResult | undefined;
    try {
      value = JSON.parse(trimmed) as ClawExecuteResult;
    } catch {
      return; // non-protocol diagnostics are ignored
    }
    const pending = this.pending;
    this.pending = null;
    pending?.resolve(value);
  }

  /** Execute one operation through the daemon, strictly serialized. */
  request(operation: string, input: unknown, timeoutMs = 30000): Promise<ClawExecuteResult> {
    const execute = async (): Promise<ClawExecuteResult> => {
      await this.open();
      if (this.handle === null) {
        throw protocolError("SESSION_CONNECTION_LOST", "claw session connection is unavailable.");
      }
      return await new Promise<ClawExecuteResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending = null;
          void this.handle?.terminate("request timeout");
          reject(protocolError("CLAW_SESSION_TIMEOUT", `claw operation timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
        this.pending = {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error: Error) => {
            clearTimeout(timer);
            reject(error);
          },
          timer,
        };
        const line = `${JSON.stringify({ operation, input })}\n`;
        this.writeStdin(line);
      });
    };
    const result = this.chain.then(execute, execute);
    this.chain = result.catch(() => undefined);
    return result;
  }

  private writeStdin(line: string): Promise<void> {
    // The subprocess seam hands pipe fds back on the handle (stdin included).
    const stdin = this.handle?.stdin;
    return new Promise<void>((resolve, reject) => {
      if (!stdin) {
        reject(protocolError("SESSION_CONNECTION_LOST", "claw session stdin is unavailable."));
        return;
      }
      stdin.write(line);
      resolve();
    });
  }

  private failPending(error: Error): void {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
  }

  close(): Promise<void> {
    return this.writeStdin("session close\n").catch(() => undefined);
  }
}
