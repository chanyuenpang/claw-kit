import { type ClawExecuteResult, type SubprocessLike } from "./claw-session.js";
/** No message matching: retry permission must be explicit and pre-execution. */
export declare function routeCommand(daemon: () => Promise<ClawExecuteResult>, baseline: () => Promise<ClawExecuteResult>): Promise<ClawExecuteResult>;
export declare function resolveCommandEntry(): string;
/** Values travel as JSON on stdin, never as shell text or user-controlled argv. */
export declare function runCommandBaseline(subprocess: SubprocessLike, workdir: string, sessionId: string, operation: string, input: unknown, entry?: string): Promise<ClawExecuteResult>;
