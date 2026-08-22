/** Concatenate the text blocks of a ContentBlock[]-shaped value. */
export declare function textFromContent(content: unknown): string;
export type EventLike = {
    time?: number;
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
/** Adapter-owned normalization of DSH history into the shared final-event contract. */
export declare function extractPlanFinalAnswers(events: EventLike[], _sessionId: string, startedAtMs?: number): Array<{
    turnId: string;
    occurredAt?: string;
    message: string;
}>;
