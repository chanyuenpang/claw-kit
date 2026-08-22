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
export function extractPlanFinalAnswers(events, _sessionId, startedAtMs) {
    const finals = new Map();
    for (let sequence = 0; sequence < events.length; sequence += 1) {
        const event = events[sequence];
        const turn = event.data?.turn;
        const time = event.time;
        if (startedAtMs !== undefined && time !== undefined && time < startedAtMs)
            continue;
        if (event.type !== "assistant/message" || typeof turn !== "number")
            continue;
        const message = textFromContent(event.data?.message?.content);
        if (message)
            finals.set(turn, { message, ...(time !== undefined ? { time } : {}), sequence });
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