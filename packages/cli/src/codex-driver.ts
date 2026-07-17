import { createHash } from "node:crypto";

export const CODEX_DRIVER_VERSION = 3;
export const CODEX_HOST_ACTION_SCHEMA_VERSION = 1;
export const CODEX_DRIVER_CACHE_KEY =
  `claw-kit:codex-driver:v${CODEX_DRIVER_VERSION}:s${CODEX_HOST_ACTION_SCHEMA_VERSION}`;

type DriverInput = {
  command: string;
  workdir: string;
  timeout_ms?: number;
};

type DriverRuntime = {
  tools: Record<string, (input: Record<string, unknown>) => Promise<unknown>>;
  text: (value: unknown) => void;
};

async function codexDriverRunner(
  { command, workdir, timeout_ms = 30000 }: DriverInput,
  { tools, text }: DriverRuntime,
): Promise<Record<string, unknown>> {
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new TypeError("command is required");
  }
  if (typeof workdir !== "string" || workdir.trim().length === 0) {
    throw new TypeError("workdir is required");
  }

  const codexCommand = /(?:^|\s)--host(?:=|\s)/.test(command)
    ? command
    : `${command} --host codex`;
  const raw = await tools.shell_command({ command: codexCommand, workdir, timeout_ms });
  const outputText = typeof raw === "string"
    ? raw
    : ((raw as Record<string, unknown>).output
      ?? (raw as Record<string, unknown>).stdout
      ?? (raw as Record<string, unknown>).text
      ?? "");
  if (typeof outputText !== "string") {
    throw new TypeError("claw command returned no text output");
  }

  const start = outputText.indexOf("{");
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index >= 0 && index < outputText.length; index += 1) {
    const character = outputText[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      end = index + 1;
      break;
    }
  }
  if (start < 0 || end < 0) {
    throw new Error("claw returned no complete JSON result");
  }

  const result = JSON.parse(outputText.slice(start, end)) as Record<string, unknown>;
  if (result.ok !== true) {
    throw new Error(`claw mutation failed: ${String(result.command ?? "unknown")}`);
  }

  const handlers: Record<string, ((input: Record<string, unknown>) => Promise<unknown>) | undefined> = {
    update_plan: tools.update_plan,
    create_goal: tools.create_goal,
    update_goal: tools.update_goal,
  };
  const allowedInput: Record<string, Set<string>> = {
    update_plan: new Set(["explanation", "plan"]),
    create_goal: new Set(["objective"]),
    update_goal: new Set(["status"]),
  };
  const consumed = new Set<string>();
  const actions = Array.isArray(result.hostActions) ? result.hostActions : [];
  for (const candidate of actions) {
    const action = candidate as Record<string, unknown>;
    const tool = typeof action.tool === "string" ? action.tool : "";
    const id = typeof action.id === "string" ? action.id : "";
    const handler = handlers[tool];
    if (action.schemaVersion !== 1 || !id || !handler) {
      throw new Error(`unsupported Codex hostAction: ${id || "unknown"}`);
    }
    if (consumed.has(id)) continue;
    const input = action.input;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error(`invalid Codex hostAction input: ${id}`);
    }
    if (Object.keys(input).some((key) => !allowedInput[tool].has(key))) {
      throw new Error(`invalid Codex hostAction input: ${id}`);
    }
    await handler(input as Record<string, unknown>);
    consumed.add(id);
  }
  const visibleKeys = new Set([
    "stage",
    "planSummary",
    "nextTask",
    "delegateSubagents",
    "recommendedCommands",
    "askUser",
    "plan",
    "planReview",
    "archivedPlanPath",
    "completionRefresh",
    "chainStatus",
    "completedOperations",
    "remainingOperations",
    "failedOperation",
  ]);
  const visibleResult = Object.fromEntries(
    Object.entries(result).filter(([key]) => visibleKeys.has(key)),
  );
  text(JSON.stringify(visibleResult));
  return visibleResult;
}

export function buildCodexDriverEnvelope(cliVersion: string): Record<string, unknown> {
  const source = codexDriverRunner.toString();
  return {
    ok: true,
    command: "codex.driver",
    cliVersion,
    driverVersion: CODEX_DRIVER_VERSION,
    hostActionSchemaVersion: CODEX_HOST_ACTION_SCHEMA_VERSION,
    cacheKey: CODEX_DRIVER_CACHE_KEY,
    sha256: createHash("sha256").update(source, "utf8").digest("hex"),
    source,
  };
}
