/**
 * DSH report-capture extraction: reads the DSH session event log and pulls the
 * current turn's final assistant message plus the assistant conclusions that
 * immediately preceded each claw_run `task.done` call — the same evidence the
 * Codex adapter extracts from its transcript. The claw_run execute path
 * writes this into the claw-kit dsh-capture file at the terminal plan
 * mutation (deterministic, no turn-stopping hook), consumed by
 * `knowledge claim`'s dsh branch (packages/cli/src/dsh-capture.ts).
 */
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
/**
 * Extract one turn's capture from a DSH session event log: the final
 * assistant message, and every assistant message that directly preceded a
 * claw_run `task.done` call (the evidence-backed conclusion contract).
 */
export function extractTurnCapture(events, turn) {
    let lastMessage;
    let lastBeforeTaskDone;
    for (const event of events) {
        const data = event.data ?? {};
        if (data.turn !== turn)
            continue;
        if (event.type === "assistant/message") {
            const text = textFromContent(data.message?.content);
            if (text)
                lastMessage = text;
        }
        else if (event.type === "tool/call" && data.name === "claw_run") {
            const args = data.arguments ?? "";
            if (args.includes("task.done")) {
                if (lastMessage !== undefined)
                    lastBeforeTaskDone = lastMessage;
            }
        }
    }
    return {
        ...(lastMessage !== undefined ? { message: lastMessage } : {}),
        taskConclusions: lastBeforeTaskDone !== undefined
            ? [{ turnId: String(turn), message: lastBeforeTaskDone }]
            : [],
    };
}
/**
 * Cross-turn extraction for a terminal plan mutation: every assistant message
 * that directly preceded a claw_run `task.done` call (from `startedAtMs` on,
 * matching the Codex transcript startedAt filter) plus the final assistant
 * message of the whole window. This is what the plan.done hook writes into the
 * dsh-capture file so `knowledge claim`'s dsh branch can materialize the
 * report without depending on turn-stopping timing.
 */
export function extractPlanCapture(events, startedAtMs) {
    const conclusions = [];
    let lastMessage;
    for (const event of events) {
        const data = event.data ?? {};
        const time = typeof event.time === "number" ? event.time : undefined;
        if (startedAtMs !== undefined && time !== undefined && time < startedAtMs)
            continue;
        if (event.type === "assistant/message") {
            const text = textFromContent(data.message?.content);
            if (text)
                lastMessage = text;
        }
        else if (event.type === "tool/call" && data.name === "claw_run") {
            const args = data.arguments ?? "";
            if (args.includes("task.done") && lastMessage !== undefined) {
                conclusions.push({
                    turnId: String(data.turn ?? "unknown"),
                    message: lastMessage,
                    ...(time !== undefined ? { time } : {}),
                });
            }
        }
    }
    return {
        ...(lastMessage !== undefined ? { message: lastMessage } : {}),
        taskConclusions: conclusions,
    };
}
//# sourceMappingURL=capture.js.map