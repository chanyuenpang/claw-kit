import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { KnowledgeWriterConfig } from "@veewo/claw-core";
import { withoutInvocationHost } from "./invocation-host.js";

export type OpencodeRunnerResult = {
  finalResponse: string;
  threadId?: string;
};

const DEFAULT_OPENCODE_AGENT = "claw-knowledge-writer";

/** Resolve the opencode CLI binary path. CLAW_OPENCODE_PATH_OVERRIDE supports hermetic tests. */
export function resolveOpencodeBinary(): string {
  return process.env.CLAW_OPENCODE_PATH_OVERRIDE ?? "opencode";
}

/**
 * Finalization runner for the opencode host. The opencode adapter cannot assume a
 * Codex SDK runtime is installed locally, so deposition runs through `opencode run`
 * inside the user's own opencode environment instead of the Codex SDK.
 */
export function runOpencodeKnowledgeWriter(input: {
  prompt: string;
  projectRoot: string;
  writer?: KnowledgeWriterConfig | null;
}): OpencodeRunnerResult {
  const binary = resolveOpencodeBinary();
  const args = [
    "run",
    "--format", "json",
    "--dir", input.projectRoot,
    "--dangerously-skip-permissions",
    "--agent", DEFAULT_OPENCODE_AGENT,
  ];
  if (input.writer?.model) {
    args.push("--model", input.writer.model);
  }
  if (input.writer?.reasoningEffort) {
    args.push("--variant", input.writer.reasoningEffort);
  }
  args.push(input.prompt);

  let result: SpawnSyncReturns<string>;
  try {
    result = spawnSync(binary, args, {
      cwd: input.projectRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
      env: { ...withoutInvocationHost(), CLAW_KNOWLEDGE_FINALIZER: "1" },
    });
  } catch (error) {
    throw new Error(`Failed to launch opencode runner: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (result.error) {
    throw new Error(`opencode runner failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`opencode run exited with status ${String(result.status)}: ${result.stderr?.trim() ?? result.stdout?.trim() ?? ""}`);
  }

  return parseOpencodeRunOutput(result.stdout ?? "");
}

type ParsedEvent = {
  type?: string;
  properties?: {
    info?: { id?: string; role?: string };
    sessionID?: string;
    part?: { messageID?: string; type?: string; text?: string };
  };
};

/**
 * Parse the NDJSON event stream emitted by `opencode run --format json`.
 * The final assistant text is reconstructed from message.part.updated text parts,
 * matched to role via the message.updated events. The last assistant message wins.
 */
export function parseOpencodeRunOutput(stdout: string): OpencodeRunnerResult {
  const messageRoles = new Map<string, string>();
  const messageTexts = new Map<string, string[]>();
  let threadId: string | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) {
      continue;
    }
    let event: ParsedEvent;
    try {
      event = JSON.parse(trimmed) as ParsedEvent;
    } catch {
      continue;
    }

    const type = event.type ?? "";
    const properties = event.properties ?? {};

    if (type === "session.created" && properties.sessionID) {
      threadId = properties.sessionID;
    }

    if (type === "message.updated" && properties.info?.id && properties.info?.role) {
      messageRoles.set(properties.info.id, properties.info.role);
    }

    if (type === "message.part.updated") {
      const part = properties.part;
      if (part && part.type === "text" && typeof part.text === "string" && part.messageID) {
        const bucket = messageTexts.get(part.messageID) ?? [];
        bucket.push(part.text);
        messageTexts.set(part.messageID, bucket);
      }
    }
  }

  let lastAssistantId: string | undefined;
  for (const [messageId, role] of messageRoles) {
    if (role === "assistant") {
      lastAssistantId = messageId;
    }
  }

  let finalResponse = "";
  if (lastAssistantId) {
    const texts = messageTexts.get(lastAssistantId);
    if (texts && texts.length > 0) {
      finalResponse = texts.join("\n").trim();
    }
  }

  return {
    finalResponse,
    ...(threadId ? { threadId } : {}),
  };
}
