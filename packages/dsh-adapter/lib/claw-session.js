function protocolError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
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
    handle = null;
    buffer = "";
    pending = null;
    openPromise = null;
    chain = Promise.resolve();
    constructor(subprocess, workdir, sessionId, clawBinary = "claw") {
        this.subprocess = subprocess;
        this.workdir = workdir;
        this.sessionId = sessionId;
        this.clawBinary = clawBinary;
    }
    invocation(argv) {
        if (process.platform === "win32") {
            return {
                executable: process.env.ComSpec ?? "cmd.exe",
                args: ["/d", "/s", "/c", `${this.clawBinary}.cmd`, ...argv],
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
            if (handle.stdout === undefined) {
                reject(protocolError("SESSION_CONNECTION_LOST", "claw session pipe unavailable."));
                return;
            }
            // Stream the pipe with plain 'data' events + line buffering. The DSH
            // subprocess seam hands back the raw child stdout, and readline-style
            // consumers were observed to miss lines on it; data events are reliable.
            this.buffer = "";
            handle.stdout.on("data", (chunk) => this.ingest(String(chunk)));
            const timer = setTimeout(() => {
                this.failPending(protocolError("CLAW_SESSION_OPEN_TIMEOUT", "claw session open timed out."));
                void handle.terminate("open timeout");
            }, 15000);
            this.pending = {
                resolve: (value) => {
                    clearTimeout(timer);
                    if (!value.ok || value.command !== "session.open") {
                        reject(protocolError("CLAW_SESSION_OPEN_FAILED", `claw session open failed: ${value.command ?? "unknown"}`));
                        return;
                    }
                    resolve();
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                },
                timer,
            };
            handle.done.catch((error) => {
                this.failPending(error instanceof Error ? error : new Error(String(error)));
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