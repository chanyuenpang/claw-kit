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
    message?: { content?: unknown };
    name?: string;
    arguments?: string;
  };
};

/** Adapter-owned normalization of DSH history into the shared final-event contract. */
export function extractPlanFinalAnswers(events: EventLike[], _sessionId: string, startedAtMs?: number): Array<{
  turnId: string;
  occurredAt?: string;
  message: string;
}> {
  const finals = new Map<number, { message: string; time?: number; sequence: number }>();
  for (let sequence = 0; sequence < events.length; sequence += 1) {
    const event = events[sequence]!;
    const turn = event.data?.turn;
    const time = event.time;
    if (startedAtMs !== undefined && time !== undefined && time < startedAtMs) continue;
    if (event.type !== "assistant/message" || typeof turn !== "number") continue;
    const message = textFromContent(event.data?.message?.content);
    if (message) finals.set(turn, { message, ...(time !== undefined ? { time } : {}), sequence });
  }
  return [...finals.entries()].map(([turn, final]) => ({
    schemaVersion: 1,
    entryType: "final_answer",
    turnId: String(turn),
    ...(final.time !== undefined ? { occurredAt: new Date(final.time).toISOString() } : {}),
    message: final.message,
  }));
}
