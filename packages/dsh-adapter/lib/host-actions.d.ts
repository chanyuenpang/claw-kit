/**
 * Auto-consumer for the CLI-generated `hostActions` protocol
 * (`schemaVersion: 1`, tools `update_plan` / `create_goal` / `update_goal`).
 *
 * The DSH adapter consumes the exact same artifacts the Codex fixed code-mode
 * driver consumes — the CLI emits them host-neutrally for every
 * `isHostActionsHost` (codex | dsh) — but does it inside the claw_run tool's
 * execute instead of a model-evaluated envelope. Consumption is fail-open: a
 * consumer error never fails the underlying mutation.
 */
/** Local structural JSON value type (independent of registry type versions). */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
/** Structural view of the DSH `goals` service (`ctx.get("goals")`). */
export type GoalsLike = {
    get(agent: unknown): {
        id: string;
        revision: number;
    } | undefined;
    create(agent: unknown, request: {
        objective: string;
        maxGoalRounds?: number;
    }): unknown;
    complete(agent: unknown, ref: {
        id: string;
        revision: number;
    }): unknown;
};
export type HostAction = {
    schemaVersion: number;
    id: string;
    tool: "update_plan" | "create_goal" | "update_goal" | string;
    input: Record<string, unknown>;
};
/**
 * Consume hostActions against DSH-native surfaces.
 *
 * - `create_goal` / `update_goal` → the native `goals` service, so DSH's own
 *   goal bar and `get_goal` reflect the claw plan lifecycle (the model never
 *   touches goal tools).
 * - `update_plan` → returned for the caller to project (progress projection is
 *   a P2 surface; the claw_run result already carries the compact guidance).
 *
 * @returns the list of consumed action ids, for the `goalSync` result field.
 */
export declare function consumeHostActions(actions: HostAction[] | undefined, goals: GoalsLike | undefined, agent: unknown): {
    consumed: string[];
    projection: HostAction | undefined;
};
/**
 * Whitelist-only compact view of a daemon `claw/execute` output — the same
 * visible-field contract the Codex driver applies (stage, plan summary,
 * next steps, notes, next task, command hints, askUser, plan).
 */
export declare function compactClawOutput(output: Record<string, unknown> | undefined): Record<string, JsonValue>;
