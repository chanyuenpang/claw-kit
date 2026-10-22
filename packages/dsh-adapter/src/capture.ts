/** Extract only ordinary text blocks, never reasoning or tool payloads. */
export function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.filter(block => block && typeof block === "object" && block.type === "text" && typeof block.text === "string")
    .map(block => block.text).join("");
}

export type EventLike = {
  seq?: number;
  time?: number;
  type?: string;
  data?: {
    turn?: number;
    message?: { id?: string; content?: unknown };
    inserted?: Array<{ id?: string; role?: string; source?: { kind?: string }; content?: unknown }>;
  };
};

/** Collect visible conversation without requiring a completed turn or a final channel. */
export function extractPlanConversation(events: EventLike[], sessionId: string, startedAtMs?: number, endedAtMs?: number) {
  const rows: Array<{
    schemaVersion: 1; entryType: "conversation_message"; role: "user" | "assistant";
    messageId: string; turnId: string; occurredAt?: string; context?: "plan_request"; message: string;
  }> = [];
  let request: (typeof rows)[number] | undefined;
  for (const [index, event] of events.entries()) {
    const time = typeof event.time === "number" && Number.isFinite(event.time) && Number.isFinite(new Date(event.time).getTime()) ? event.time : undefined;
    if (time !== undefined && endedAtMs !== undefined && time >= endedAtMs) continue;
    // Unknown timestamps are omitted from bounded captures, not a reason to block the job.
    if (time === undefined && (startedAtMs !== undefined || endedAtMs !== undefined)) continue;
    const messages: Array<{ role: "user" | "assistant"; id?: string; content?: unknown }> = [];
    if (event.type === "assistant/message" || event.type === "assistant/final") {
      messages.push({ role: "assistant", ...event.data?.message });
    } else if (event.type === "user/message") {
      messages.push({ role: "user", ...event.data?.message });
    } else if (event.type === "agent/inbox/spliced") {
      for (const item of event.data?.inserted ?? []) {
        // Only real user input, not reminders, worker reports or synthetic host context.
        if (item.role === "user" && item.source?.kind === "user") messages.push({ ...item, role: "user" });
      }
    }
    for (const [part, item] of messages.entries()) {
      const message = textFromContent(item.content);
      if (!message.trim()) continue;
      const row: (typeof rows)[number] = {
        schemaVersion: 1, entryType: "conversation_message", role: item.role,
        messageId: item.id ?? sessionId + ":" + (event.seq ?? index) + ":" + part,
        turnId: String(event.data?.turn ?? event.seq ?? index),
        ...(time !== undefined ? { occurredAt: new Date(time).toISOString() } : {}), message,
      };
      if (time !== undefined && startedAtMs !== undefined && time < startedAtMs) {
        if (row.role === "user") request = { ...row, context: "plan_request" };
      } else rows.push(row);
    }
  }
  if (request) rows.unshift(request);
  // Native message IDs identify replayed snapshots; identical text in different messages stays.
  return [...new Map(rows.map(row => [row.messageId, row])).values()];
}
