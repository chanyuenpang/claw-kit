/** Concatenate the text blocks of a ContentBlock[]-shaped value. */
export function textFromContent(content) {
    if (!Array.isArray(content))
        return "";
    let text = "";
    for (const block of content) {
        if (block
            && typeof block === "object"
            && block.type === "text"
            && typeof block.text === "string") {
            text += block.text;
        }
    }
    return text;
}
/** Adapter-owned normalization of DSH history into the shared final-event contract. */
export function extractPlanFinalAnswers(events, _sessionId, startedAtMs, endedAtMs) {
    const finals = new Map();
    for (const event of events) {
        const turn = event.data?.turn;
        const time = event.time;
        if (startedAtMs !== undefined && time !== undefined && time < startedAtMs)
            continue;
        // The last assistant/message before a tool call is not a final answer.
        // No Host turn-final hook is required: absence of a proven final is valid
        // information loss, never a reason to delay the knowledge writer.
        if (event.type !== "assistant/final" || typeof turn !== "number")
            continue;
        if (endedAtMs !== undefined) {
            if (typeof time !== "number" || !Number.isFinite(time))
                throw new Error("DSH_REPORT_BOUNDARY_UNAVAILABLE");
            if (time >= endedAtMs)
                continue;
        }
        const message = textFromContent(event.data?.message?.content);
        if (message)
            finals.set(turn, { message, ...(time !== undefined ? { time } : {}) });
    }
    return [...finals.entries()].map(([turn, final]) => ({
        schemaVersion: 1,
        entryType: "final_answer",
        turnId: String(turn),
        ...(final.time !== undefined ? { occurredAt: new Date(final.time).toISOString() } : {}),
        message: final.message,
    }));
}
//# sourceMappingURL=capture.js.map