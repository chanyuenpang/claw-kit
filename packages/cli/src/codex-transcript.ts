import fs from "node:fs";

type TranscriptRecord = {
  type?: unknown;
  payload?: {
    type?: unknown;
    role?: unknown;
    phase?: unknown;
    content?: unknown;
  };
};

export function extractLatestFinalAssistantMessage(transcriptPath: string): string | null {
  if (!transcriptPath.trim() || !fs.existsSync(transcriptPath)) {
    return null;
  }
  const lines = fs.readFileSync(transcriptPath, "utf-8").split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }
    let record: TranscriptRecord;
    try {
      record = JSON.parse(line) as TranscriptRecord;
    } catch {
      continue;
    }
    if (
      record.type !== "response_item"
      || record.payload?.type !== "message"
      || record.payload.role !== "assistant"
      || record.payload.phase !== "final_answer"
      || !Array.isArray(record.payload.content)
    ) {
      continue;
    }
    const message = record.payload.content
      .filter((item): item is { type?: unknown; text: string } => (
        Boolean(item)
        && typeof item === "object"
        && "text" in item
        && typeof (item as { text?: unknown }).text === "string"
      ))
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (message) {
      return message;
    }
  }
  return null;
}
