import { type HostAction } from "./host-actions.js";
export declare const name = "claw-kit";
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
