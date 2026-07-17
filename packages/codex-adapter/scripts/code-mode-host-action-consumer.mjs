const SUPPORTED_SCHEMA_VERSION = 1;
const PLAN_STATUSES = new Set(["pending", "in_progress", "completed"]);
const GOAL_STATUSES = new Set(["complete", "blocked"]);

export function parseClawCommandResult(rawResult) {
  const text = normalizeCommandResult(rawResult);
  const json = extractFirstJsonObject(text);
  const result = JSON.parse(json);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new TypeError("claw command output must contain a JSON object");
  }
  return result;
}

export async function consumeCodexHostActions({ result, hostTools, consumedIds = new Set() }) {
  if (!hostTools || typeof hostTools !== "object") {
    throw new TypeError("hostTools is required");
  }

  const consumedActionIds = [];
  for (const action of result?.hostActions ?? []) {
    validateActionEnvelope(action);
    if (consumedIds.has(action.id)) {
      continue;
    }

    const input = validateActionInput(action);
    const hostTool = hostTools[action.tool];
    if (typeof hostTool !== "function") {
      throw new Error(`Codex host tool is unavailable: ${action.tool}`);
    }
    await hostTool(input);
    consumedIds.add(action.id);
    consumedActionIds.push(action.id);
  }

  return { consumedActionIds, consumedIds };
}

export async function runCodexPlanMutation({ command, runCommand, hostTools, consumedIds = new Set() }) {
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new TypeError("command is required");
  }
  if (typeof runCommand !== "function") {
    throw new TypeError("runCommand is required");
  }

  const rawResult = await runCommand(command);
  const result = parseClawCommandResult(rawResult);
  if (result.ok !== true) {
    throw new Error(`claw plan mutation failed: ${result.command ?? "unknown command"}`);
  }

  const consumption = await consumeCodexHostActions({ result, hostTools, consumedIds });
  return { rawResult, result, ...consumption };
}

function validateActionEnvelope(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new TypeError("hostAction must be an object");
  }
  if (typeof action.id !== "string" || action.id.length === 0) {
    throw new TypeError("hostAction.id must be a non-empty string");
  }
  if (action.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`Unsupported hostAction schemaVersion: ${String(action.schemaVersion)}`);
  }
  if (!["update_plan", "create_goal", "update_goal"].includes(action.tool)) {
    throw new Error(`Unsupported Codex hostAction tool: ${String(action.tool)}`);
  }
}

function validateActionInput(action) {
  const input = action.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`${action.tool}.input must be an object`);
  }

  if (action.tool === "update_plan") {
    assertOnlyKeys(input, ["explanation", "plan"], action.tool);
    if (input.explanation !== undefined && typeof input.explanation !== "string") {
      throw new TypeError("update_plan.input.explanation must be a string when present");
    }
    if (!Array.isArray(input.plan) || input.plan.length === 0) {
      throw new TypeError("update_plan.input.plan must be a non-empty array");
    }
    for (const item of input.plan) {
      assertOnlyKeys(item, ["step", "status"], "update_plan plan item");
      if (typeof item.step !== "string" || !PLAN_STATUSES.has(item.status)) {
        throw new TypeError("update_plan plan items require step and a supported status");
      }
    }
    return input;
  }

  if (action.tool === "create_goal") {
    assertOnlyKeys(input, ["objective"], action.tool);
    if (typeof input.objective !== "string" || input.objective.length === 0) {
      throw new TypeError("create_goal.input.objective must be a non-empty string");
    }
    return input;
  }
  assertOnlyKeys(input, ["status"], action.tool);
  if (!GOAL_STATUSES.has(input.status)) {
    throw new TypeError("update_goal.input.status must be complete or blocked");
  }
  return input;
}

function assertOnlyKeys(value, allowedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unsupported input fields: ${unexpected.join(", ")}`);
  }
}

function normalizeCommandResult(rawResult) {
  if (typeof rawResult === "string") {
    return rawResult;
  }
  if (rawResult && typeof rawResult === "object") {
    for (const key of ["output", "stdout", "text"]) {
      if (typeof rawResult[key] === "string") {
        return rawResult[key];
      }
    }
  }
  throw new TypeError("runCommand must return text or an object containing output text");
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) {
    throw new SyntaxError("claw command output does not contain JSON");
  }

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        quoted = false;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new SyntaxError("claw command output contains incomplete JSON");
}
