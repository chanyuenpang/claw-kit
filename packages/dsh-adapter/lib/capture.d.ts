/**
 * DSH report-capture extraction: reads the DSH session event log and pulls the
 * current turn's final assistant message plus the assistant conclusions that
 * immediately preceded each claw_run `task.done` call — the same evidence the
 * Codex adapter extracts from its transcript. The claw_run execute path
 * writes this into the claw-kit dsh-capture file at the terminal plan
 * mutation (deterministic, no turn-stopping hook), consumed by
 * `knowledge claim`'s dsh branch (packages/cli/src/dsh-capture.ts).
 */
export type TurnCapture = {
    message?: string;
    taskConclusions: Array<{
        turnId: string;
        message: string;
        time?: number;
    }>;
};
/** Concatenate the text blocks of a ContentBlock[]-shaped value. */
export declare function textFromContent(content: unknown): string;
export type EventLike = {
    type?: string;
    data?: {
        turn?: number;
        message?: {
            content?: unknown;
        };
        name?: string;
        arguments?: string;
    };
};
/**
 * Extract one turn's capture from a DSH session event log: the final
 * assistant message, and every assistant message that directly preceded a
 * claw_run `task.done` call (the evidence-backed conclusion contract).
 */
export declare function extractTurnCapture(events: EventLike[], turn: number): TurnCapture;
/**
 * Cross-turn extraction for a terminal plan mutation: every assistant message
 * that directly preceded a claw_run `task.done` call (from `startedAtMs` on,
 * matching the Codex transcript startedAt filter) plus the final assistant
 * message of the whole window. This is what the plan.done hook writes into the
 * dsh-capture file so `knowledge claim`'s dsh branch can materialize the
 * report without depending on turn-stopping timing.
 */
export declare function extractPlanCapture(events: EventLike[], startedAtMs?: number): TurnCapture;
