import fs from "node:fs";

type TranscriptRecord = {
  type?: unknown;
  payload?: {
    turn_id?: unknown;
    type?: unknown;
    role?: unknown;
    phase?: unknown;
    content?: unknown;
    output?: unknown;
    internal_chat_message_metadata_passthrough?: {
      turn_id?: unknown;
    };
  };
};

export type TaskDoneConclusion = {
  turnId: string;
  message: string;
};

export function extractTaskDoneConclusions(
  transcriptPath: string,
  targetTurnId?: string,
): TaskDoneConclusion[] {
  if (!transcriptPath.trim() || !fs.existsSync(transcriptPath)) {
    return [];
  }
  const latestAssistantByTurn = new Map<string, string>();
  const conclusions: TaskDoneConclusion[] = [];
  const seen = new Set<string>();
  for (const line of readTranscriptTurnLines(transcriptPath, targetTurnId)) {
    let record: TranscriptRecord;
    try {
      record = JSON.parse(line) as TranscriptRecord;
    } catch {
      continue;
    }
    if (record.type !== "response_item") {
      continue;
    }
    const turnId = readTurnId(record);
    if (!turnId || (targetTurnId && turnId !== targetTurnId)) {
      continue;
    }
    if (record.payload?.type === "message" && record.payload.role === "assistant") {
      const message = readTextItems(record.payload.content);
      if (message) {
        latestAssistantByTurn.set(turnId, message);
      }
      continue;
    }
    if (record.payload?.type !== "custom_tool_call_output"
      && record.payload?.type !== "function_call_output") {
      continue;
    }
    const conclusion = latestAssistantByTurn.get(turnId);
    if (!conclusion) {
      continue;
    }
    for (const _marker of extractTaskDoneMarkers(readOutputText(record.payload.output))) {
      const key = `${turnId}\n${conclusion}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      conclusions.push({
        turnId,
        message: conclusion,
      });
    }
  }
  return conclusions;
}

export function extractLatestFinalAssistantMessage(
  transcriptPath: string,
  targetTurnId?: string,
): string | null {
  if (!transcriptPath.trim() || !fs.existsSync(transcriptPath)) {
    return null;
  }
  const lines = readTranscriptTurnLines(transcriptPath, targetTurnId);
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

function readTranscriptTurnLines(transcriptPath: string, targetTurnId?: string): string[] {
  const lines = fs.readFileSync(transcriptPath, "utf-8").split(/\r?\n/);
  if (!targetTurnId) {
    return lines;
  }
  const contexts: Array<{ index: number; turnId: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line?.includes('"type":"turn_context"')) {
      continue;
    }
    try {
      const record = JSON.parse(line) as TranscriptRecord;
      const turnId = record.type === "turn_context" && typeof record.payload?.turn_id === "string"
        ? record.payload.turn_id
        : "";
      if (turnId) {
        contexts.push({ index, turnId });
      }
    } catch {
      continue;
    }
  }
  let position = -1;
  for (let index = contexts.length - 1; index >= 0; index -= 1) {
    if (contexts[index]?.turnId === targetTurnId) {
      position = index;
      break;
    }
  }
  if (position < 0) {
    return lines;
  }
  let first = position;
  while (first > 0 && contexts[first - 1]?.turnId === targetTurnId) {
    first -= 1;
  }
  let last = position;
  while (last + 1 < contexts.length && contexts[last + 1]?.turnId === targetTurnId) {
    last += 1;
  }
  const start = contexts[first]!.index;
  const end = contexts[last + 1]?.index ?? lines.length;
  return lines.slice(start, end);
}

function readTurnId(record: TranscriptRecord): string | null {
  const value = record.payload?.internal_chat_message_metadata_passthrough?.turn_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTextItems(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .filter((item): item is { text: string } => (
      Boolean(item)
      && typeof item === "object"
      && "text" in item
      && typeof (item as { text?: unknown }).text === "string"
    ))
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function readOutputText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return readTextItems(value);
}

function extractTaskDoneMarkers(text: string): true[] {
  const markers: true[] = [];
  for (const candidate of jsonObjectCandidates(text)) {
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }
    collectTaskDoneMarkers(value, markers);
  }
  return markers;
}

function collectTaskDoneMarkers(value: unknown, markers: true[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.ok === true && record.command === "task.done") {
    markers.push(true);
  }
}

function jsonObjectCandidates(text: string): string[] {
  const results: string[] = [];
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        results.push(text.slice(start, index + 1));
        break;
      }
    }
  }
  return results;
}
