/** Concatenate the text blocks of a ContentBlock[]-shaped value. */
export function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content) {
    if (
      block
      && typeof block === "object"
      && (block as { type?: unknown }).type === "text"
      && typeof (block as { text?: unknown }).text === "string"
    ) {
      text += (block as { text: string }).text;
    }
  }
  return text;
}

export type EventLike = {
  time?: number;
  type?: string;
  data?: {
    turn?: number;
    interrupted?: boolean;
    reason?: { kind?: string };
    message?: { content?: unknown };
    name?: string;
    arguments?: string;
  };
};

/** Adapter-owned normalization of DSH history into the shared final-event contract. */
export function extractPlanFinalAnswers(events: EventLike[], _sessionId: string, startedAtMs?: number, endedAtMs?: number): Array<{
  turnId: string;
  occurredAt?: string;
  message: string;
}> {
  const finals = new Map<number, { message: string; time?: number }>();
  const candidates = new Map<number, EventLike>();
  const boundaryError = () => new Error("DSH_REPORT_BOUNDARY_UNAVAILABLE");
  if ((startedAtMs !== undefined && !Number.isFinite(startedAtMs))
    || (endedAtMs !== undefined && !Number.isFinite(endedAtMs))
    || (startedAtMs !== undefined && endedAtMs !== undefined && endedAtMs < startedAtMs)) throw boundaryError();
  const inWindow = (event: EventLike): boolean => {
    const time = event.time;
    if (time === undefined) {
      if (startedAtMs !== undefined || endedAtMs !== undefined) throw boundaryError();
      return true; // Legacy unbounded history only.
    }
    if (typeof time !== "number" || !Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) throw boundaryError();
    return (startedAtMs === undefined || time >= startedAtMs)
      && (endedAtMs === undefined || time < endedAtMs);
  };
  const finalText = (event: EventLike): string => {
    const content = event.data?.message?.content;
    if (event.data?.interrupted || (Array.isArray(content) && content.some(block =>
      block && typeof block === "object" && block.type === "tool-call"))) return "";
    return textFromContent(content);
  };
  for (const event of events) {
    const turn = event.data?.turn;
    if (typeof turn !== "number" || !Number.isSafeInteger(turn)) continue;
    if (event.type === "assistant/message") {
      // Track the actual last message, including disqualifying messages; never
      // fall back to older commentary when the last response was interrupted.
      if (finalText(event)) candidates.set(turn, event);
      else candidates.delete(turn);
    } else if (event.type === "tool/call") {
      candidates.delete(turn);
    } else if (event.type === "assistant/final") {
      // Compatibility with older Hosts that emitted an explicit final event.
      const message = finalText(event);
      if (message && inWindow(event)) finals.set(turn, { message, time: event.time });
    } else if (event.type === "turn/end") {
      const candidate = candidates.get(turn);
      candidates.delete(turn);
      if (event.data?.reason?.kind !== "completed") {
        finals.delete(turn);
        continue;
      }
      // A still-open turn has no proof and legitimately contributes no final;
      // report capture never waits for Stop or expands the frozen upper bound.
      if (!candidate || !inWindow(event) || !inWindow(candidate)) continue;
      if (event.time !== undefined && candidate.time !== undefined && event.time < candidate.time) throw boundaryError();
      finals.set(turn, { message: finalText(candidate), time: candidate.time });
    }
  }
  return [...finals.entries()].map(([turn, final]) => ({
    schemaVersion: 1,
    entryType: "final_answer",
    turnId: String(turn),
    ...(final.time !== undefined ? { occurredAt: new Date(final.time).toISOString() } : {}),
    message: final.message,
  }));
}
