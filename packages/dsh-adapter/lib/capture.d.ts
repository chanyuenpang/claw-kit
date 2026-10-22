/** Extract only ordinary text blocks, never reasoning or tool payloads. */
export declare function textFromContent(content: unknown): string;
export type EventLike = {
    seq?: number;
    time?: number;
    type?: string;
    data?: {
        turn?: number;
        message?: {
            id?: string;
            content?: unknown;
        };
        inserted?: Array<{
            id?: string;
            role?: string;
            source?: {
                kind?: string;
            };
            content?: unknown;
        }>;
    };
};
/** Collect visible conversation without requiring a completed turn or a final channel. */
export declare function extractPlanConversation(events: EventLike[], sessionId: string, startedAtMs?: number, endedAtMs?: number): {
    schemaVersion: 1;
    entryType: "conversation_message";
    role: "user" | "assistant";
    messageId: string;
    turnId: string;
    occurredAt?: string;
    context?: "plan_request";
    message: string;
}[];
