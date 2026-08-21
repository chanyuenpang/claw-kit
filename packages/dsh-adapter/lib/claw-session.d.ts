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
 * A persistent `claw session open <workdir> <sessionId> --host dsh` JSON-RPC
 * connection over stdio, owned by one DSH session. Mirrors the Cindy
 * adapter's NativeClawSession, including the Windows `.cmd` invocation shape.
 */
export declare class ClawSession {
    private readonly subprocess;
    private readonly workdir;
    private readonly sessionId;
    private readonly clawBinary;
    private handle;
    private buffer;
    private pending;
    private openPromise;
    private chain;
    constructor(subprocess: SubprocessLike, workdir: string, sessionId: string, clawBinary?: string);
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
