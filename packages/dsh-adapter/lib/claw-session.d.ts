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
            stdout: "pipe" | "ignore" | "inherit" | {
                mode: "collect";
                maxBytes: number;
                spill?: {
                    maxBytes: number;
                };
            };
            stderr: "pipe" | "ignore" | "inherit" | {
                mode: "collect";
                maxBytes: number;
                spill?: {
                    maxBytes: number;
                };
            };
        };
        graceMs?: number;
        signal?: AbortSignal;
    }): SubprocessHandleLike;
};
export type SubprocessHandleLike = {
    readonly stdin?: {
        write(data: string): boolean;
        on?(event: "error", listener: (error: Error) => void): unknown;
    };
    readonly stdout?: Readable;
    readonly stderr?: Readable;
    readonly collected?: {
        stdout?: {
            readFrom?(offset: number): {
                text: string;
                lossy: boolean;
            };
            finalize(): {
                text: string;
            };
        };
        stderr?: {
            readFrom?(offset: number): {
                text: string;
                lossy: boolean;
            };
            finalize(): {
                text: string;
            };
        };
    };
    readonly done: Promise<unknown>;
    waitForExit?(): Promise<unknown>;
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
    error?: {
        code?: string;
        message?: string;
        outcome?: "known" | "unknown";
    };
};
/**
 * Resolve a direct "node <claw>/dist/bin.js" invocation on Windows by locating
 * the "claw.cmd" shim on PATH and checking for the adjacent npm package
 * layout. Spawning node directly lets terminate() kill the real child instead
 * of only the cmd.exe wrapper — the wrapper-only kill used to orphan the node
 * process tree on every open timeout. Returns null when the layout cannot be
 * resolved; callers then fall back to the legacy cmd.exe shape.
 */
export declare function resolveDirectClawInvocation(options: {
    clawBinary: string;
    pathValue: string | undefined;
    nodeExecutable: string;
    exists: (candidate: string) => boolean;
}): {
    executable: string;
    script: string;
} | null;
/**
 * A persistent `claw session open <workdir> <sessionId> --host dsh` JSON-RPC
 * connection over stdio, owned by one DSH session. Mirrors the Cindy
 * adapter's NativeClawSession, including the Windows `.cmd` invocation shape.
 */
export declare class ClawSession {
    private readonly subprocess;
    private readonly workdir;
    private readonly sessionId;
    private readonly clawBinary;
    private readonly openTimeoutMs;
    private readonly idleTimeoutMs;
    private readonly onIdle?;
    private readonly onExit?;
    private handle;
    private buffer;
    private stderrBuffer;
    private pending;
    private openPromise;
    private chain;
    private windowsEntry;
    private idleTimer;
    private queued;
    private requestsStarted;
    private closing;
    private closed;
    private closeReason;
    private lastActivityAt;
    constructor(subprocess: SubprocessLike, workdir: string, sessionId: string, clawBinary?: string, openTimeoutMs?: number, idleTimeoutMs?: number, onIdle?: ((session: ClawSession) => void) | undefined, onExit?: ((session: ClawSession) => void) | undefined);
    status(): {
        workdir: string;
        sessionId: string;
        state: "active" | "idle" | "reclaiming" | "dead";
        queued: number;
        requestsStarted: number;
        lastActivityAt: number;
        closeReason: string | null;
    };
    private notifyDead;
    private clearIdle;
    private scheduleIdle;
    private invocation;
    open(allowClosing?: boolean): Promise<void>;
    /** Consume raw stream chunks, splitting protocol JSON on newlines. */
    private ingest;
    private consume;
    /** Execute one operation through the daemon, strictly serialized. */
    request(operation: string, input: unknown, timeoutMs?: number, route?: (send: () => Promise<ClawExecuteResult>) => Promise<ClawExecuteResult>): Promise<ClawExecuteResult>;
    private writeStdin;
    private dropHandle;
    private failPending;
    close(reason?: string): Promise<void>;
}
