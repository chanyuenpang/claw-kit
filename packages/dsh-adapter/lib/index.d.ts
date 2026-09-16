import { type HostAction } from "./host-actions.js";
export declare const name = "claw-kit";
export type FinalizerDispatchRecord = {
    runId: string;
    settled: boolean;
};
type SubagentChildLike = {
    kind?: string;
    id?: string;
    activity?: string;
    mode?: string;
    label?: string;
};
export type SubagentsLike = {
    start(name: string, request: {
        label?: string;
        prompt: Array<{
            type: string;
            text: string;
        }>;
        parent: unknown;
        signal?: AbortSignal;
    }): Promise<{
        id: string;
        result?: Promise<unknown>;
        dispose?: () => Promise<void>;
    }>;
    listChildren?(parentSessionId: string): Promise<SubagentChildLike[]>;
};
/** The label every writer child for one finalizeId carries. */
export declare function finalizerChildLabel(finalizeId: string): string;
/**
 * Decide whether a writer child for this finalizeId is already live, so the
 * dispatch can be skipped instead of starting a second one.
 *
 * Two sources, cheapest first:
 *  1. the in-process record — a writer child this process started and has
 *     not seen settle. No race, covers repeated dispatches.
 *  2. the durable child catalog — this parent's children, filtered to a
 *     still-running child carrying the finalizeId label. Covers an adapter
 *     process restart, where the in-process map is gone. The label is
 *     durable for one-shot children too (the runtime snapshots a descriptor
 *     for every child it starts), which is why the finalizer can stay
 *     one-shot and still be found.
 *
 * Fail-open: an absent service, a missing projection registry, or a session
 * store that throws must never block the dispatch — and must never be
 * reported as a reuse.
 */
export declare function resolveFinalizerReuse(input: {
    finalizeId: string;
    parentSessionId: string;
    label: string;
    subagents?: SubagentsLike;
    records?: Map<string, FinalizerDispatchRecord>;
}): Promise<{
    runId: string;
    source: "in-process" | "durable";
} | undefined>;
export declare const inject: string[];
export type DshTodo = {
    content: string;
    status: "pending" | "in_progress" | "completed";
};
export declare function createAgentGuidanceStore(): {
    get(scope: object | undefined): string;
    set(agent: object, guidance: string): void;
};
export declare function projectTodos(projection: HostAction | undefined, output: Record<string, unknown> | undefined): DshTodo[] | undefined;
export declare function apply(ctx: unknown): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
