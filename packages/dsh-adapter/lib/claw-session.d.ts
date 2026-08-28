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
    };
    readonly stdout?: Readable;
    readonly collected?: {
        stdout?: {
            finalize(): {
                text: string;
            };
        };
        stderr?: {
            finalize(): {
                text: string;
            };
        };
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
    error?: {
        code?: string;
        message?: string;
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
    private handle;
    private buffer;
    private pending;
    private openPromise;
    private chain;
    private windowsEntry;
    constructor(subprocess: SubprocessLike, workdir: string, sessionId: string, clawBinary?: string, openTimeoutMs?: number);
    private invocation;
    open(): Promise<void>;
    /** Consume raw stream chunks, splitting protocol JSON on newlines. */
    private ingest;
    private consume;
    /** Execute one operation through the daemon, strictly serialized. */
    request(operation: string, input: unknown, timeoutMs?: number): Promise<ClawExecuteResult>;
    private writeStdin;
    private failPending;
    close(): Promise<void>;
}
