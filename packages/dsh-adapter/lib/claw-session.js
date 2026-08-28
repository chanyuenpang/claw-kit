import fs from "node:fs";
import path from "node:path";
function protocolError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}
/**
 * Resolve a direct "node <claw>/dist/bin.js" invocation on Windows by locating
 * the "claw.cmd" shim on PATH and checking for the adjacent npm package
 * layout. Spawning node directly lets terminate() kill the real child instead
 * of only the cmd.exe wrapper — the wrapper-only kill used to orphan the node
 * process tree on every open timeout. Returns null when the layout cannot be
 * resolved; callers then fall back to the legacy cmd.exe shape.
 */
export function resolveDirectClawInvocation(options) {
    const { clawBinary, pathValue, nodeExecutable, exists } = options;
    if (!pathValue)
        return null;
    for (const dir of pathValue.split(";")) {
        const trimmed = dir.trim().replace(/^"|"$/g, "");
        if (!trimmed)
            continue;
        if (!exists(path.join(trimmed, clawBinary + ".cmd")))
            continue;
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
    subprocess;
    workdir;
    sessionId;
    clawBinary;
    openTimeoutMs;
    handle = null;
    buffer = "";
    pending = null;
    openPromise = null;
    chain = Promise.resolve();
    windowsEntry;
    constructor(subprocess, workdir, sessionId, clawBinary = "claw", openTimeoutMs = 15000) {
        this.subprocess = subprocess;
        this.workdir = workdir;
        this.sessionId = sessionId;
        this.clawBinary = clawBinary;
        this.openTimeoutMs = openTimeoutMs;
    }
    invocation(argv) {
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
    open() {
        if (this.openPromise)
            return this.openPromise;
        this.openPromise = new Promise((resolve, reject) => {
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
                    stderr: { mode: "collect", maxBytes: 131072 },
                },
                graceMs: 8000,
            });
            this.handle = handle;
            const reset = () => {
                // A failed open must not poison the cached promise: the next request
                // gets a fresh spawn instead of a dead handle.
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
            handle.stdout.on("data", (chunk) => this.ingest(String(chunk)));
            const timer = setTimeout(() => {
                // Reject the pending open BEFORE reset() clears this.pending —
                // otherwise failPending reads null and the open promise never
                // settles, hanging claw_run forever with the retry path in
                // index.ts unreachable.
                this.failPending(protocolError("CLAW_SESSION_OPEN_TIMEOUT", "claw session open timed out."));
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
                reject: (error) => {
                    clearTimeout(timer);
                    reset();
                    reject(error);
                },
                timer,
            };
            handle.done.catch((error) => {
                // Same ordering rule as the open timer: reject before reset clears
                // the pending slot, or a dead child leaves open() unsettled forever.
                this.failPending(error instanceof Error ? error : new Error(String(error)));
                reset();
            });
        });
        return this.openPromise;
    }
    /** Consume raw stream chunks, splitting protocol JSON on newlines. */
    ingest(chunk) {
        this.buffer += chunk;
        while (true) {
            const newline = this.buffer.indexOf("\n");
            if (newline < 0)
                return;
            const line = this.buffer.slice(0, newline);
            this.buffer = this.buffer.slice(newline + 1);
            this.consume(line);
        }
    }
    consume(line) {
        const trimmed = line.trim();
        if (!trimmed)
            return;
        let value;
        try {
            value = JSON.parse(trimmed);
        }
        catch {
            return; // non-protocol diagnostics are ignored
        }
        const pending = this.pending;
        this.pending = null;
        pending?.resolve(value);
    }
    /** Execute one operation through the daemon, strictly serialized. */
    request(operation, input, timeoutMs = 30000) {
        const execute = async () => {
            await this.open();
            if (this.handle === null) {
                throw protocolError("SESSION_CONNECTION_LOST", "claw session connection is unavailable.");
            }
            return await new Promise((resolve, reject) => {
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
                    reject: (error) => {
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
    writeStdin(line) {
        // The subprocess seam hands pipe fds back on the handle (stdin included).
        const stdin = this.handle?.stdin;
        return new Promise((resolve, reject) => {
            if (!stdin) {
                reject(protocolError("SESSION_CONNECTION_LOST", "claw session stdin is unavailable."));
                return;
            }
            stdin.write(line);
            resolve();
        });
    }
    failPending(error) {
        const pending = this.pending;
        this.pending = null;
        pending?.reject(error);
    }
    close() {
        return this.writeStdin("session close\n").catch(() => undefined);
    }
}
//# sourceMappingURL=claw-session.js.map