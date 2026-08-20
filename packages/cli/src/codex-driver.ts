import { createHash } from "node:crypto";

export const CODEX_DRIVER_VERSION = 13;
export const CODEX_HOST_ACTION_SCHEMA_VERSION = 1;
export const CODEX_DRIVER_CACHE_KEY =
  `claw-kit:codex-driver:v${CODEX_DRIVER_VERSION}:s${CODEX_HOST_ACTION_SCHEMA_VERSION}`;

type DriverInput = {
  argv: string[];
  workdir: string;
  timeout_ms?: number;
};

type DriverRuntime = {
  tools: Record<string, (input: Record<string, unknown>) => Promise<unknown>>;
  text: (value: unknown) => void;
};

async function codexDriverRunner(
  { argv, workdir, timeout_ms = 30000 }: DriverInput,
  { tools, text }: DriverRuntime,
): Promise<Record<string, unknown>> {
  if (
    !Array.isArray(argv)
    || argv.length === 0
    || argv.some((value) => typeof value !== "string")
    || !["plan", "task", "subplan"].includes(argv[0] as string)
    || argv.some((value) => value === "--host")
  ) {
    throw new TypeError("argv must be a structured plan, task, or subplan command without --host");
  }
  if (typeof workdir !== "string" || workdir.trim().length === 0) {
    throw new TypeError("workdir is required");
  }

  const serializedArgv = JSON.stringify(argv);
  let encodedArgv = "";
  for (let index = 0; index < serializedArgv.length; index += 1) {
    encodedArgv += serializedArgv.charCodeAt(index).toString(16).padStart(4, "0");
  }
  const codexCommand = `claw codex invoke ${encodedArgv}`;
  const raw = typeof tools.shell_command === "function"
    ? await tools.shell_command({ command: codexCommand, workdir, timeout_ms })
    : typeof tools.exec_command === "function"
      ? await tools.exec_command({ cmd: codexCommand, workdir, yield_time_ms: timeout_ms })
      : (() => { throw new Error("Codex host has no supported command-execution tool"); })();
  const outputText = typeof raw === "string"
    ? raw
    : ((raw as Record<string, unknown>).output
      ?? (raw as Record<string, unknown>).stdout
      ?? (raw as Record<string, unknown>).text
      ?? "");
  if (typeof outputText !== "string") {
    throw new TypeError("claw command returned no text output");
  }

  let result: Record<string, unknown> | undefined;
  for (let candidateStart = outputText.indexOf("{"); candidateStart >= 0; candidateStart = outputText.indexOf("{", candidateStart + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = candidateStart; index < outputText.length; index += 1) {
      const character = outputText[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        try {
          const parsed = JSON.parse(outputText.slice(candidateStart, index + 1)) as unknown;
          if (
            parsed
            && typeof parsed === "object"
            && !Array.isArray(parsed)
            && typeof (parsed as Record<string, unknown>).ok === "boolean"
            && typeof (parsed as Record<string, unknown>).command === "string"
          ) {
            result = parsed as Record<string, unknown>;
          }
        } catch {
          // Continue after unrelated shell diagnostics that happen to contain braces.
        }
        break;
      }
    }
    if (result) break;
  }
  if (!result) {
    throw new Error("claw returned no valid JSON protocol result");
  }

  if (result.ok !== true) {
    throw new Error(`claw mutation failed: ${String(result.command ?? "unknown")}`);
  }

  const handlers: Record<string, ((input: Record<string, unknown>) => Promise<unknown>) | undefined> = {
    update_plan: tools.update_plan,
    create_goal: tools.create_goal,
    update_goal: tools.update_goal,
  };
  const planStatuses = new Set(["pending", "in_progress", "completed"]);
  const goalStatuses = new Set(["complete", "blocked"]);
  const consumed = new Set<string>();
  let goalRecovery: Record<string, string> | undefined;
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
    const inputRecord = input as Record<string, unknown>;
    if (tool === "update_plan") {
      if (
        Object.keys(inputRecord).some((key) => key !== "explanation" && key !== "plan")
        || (inputRecord.explanation !== undefined && typeof inputRecord.explanation !== "string")
        || !Array.isArray(inputRecord.plan)
        || inputRecord.plan.length === 0
        || inputRecord.plan.some((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return true;
          const planItem = item as Record<string, unknown>;
          return Object.keys(planItem).some((key) => key !== "step" && key !== "status")
            || typeof planItem.step !== "string"
            || !planStatuses.has(String(planItem.status));
        })
      ) {
        throw new Error(`invalid Codex hostAction input: ${id}`);
      }
    } else if (tool === "create_goal") {
      if (
        Object.keys(inputRecord).some((key) => key !== "objective")
        || typeof inputRecord.objective !== "string"
        || inputRecord.objective.length === 0
      ) {
        throw new Error(`invalid Codex hostAction input: ${id}`);
      }
    } else if (
      Object.keys(inputRecord).some((key) => key !== "status")
      || !goalStatuses.has(String(inputRecord.status))
    ) {
      throw new Error(`invalid Codex hostAction input: ${id}`);
    }
    if (tool === "create_goal" || tool === "update_goal") {
      if (typeof tools.get_goal !== "function") {
        throw new Error("Codex host tool is unavailable: get_goal");
      }
      const snapshot = await tools.get_goal({});
      const goal = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? (snapshot as Record<string, unknown>).goal
        : undefined;
      const goalRecord = goal && typeof goal === "object" && !Array.isArray(goal)
        ? goal as Record<string, unknown>
        : undefined;
      const goalStatus = goalRecord?.status;
      const openGoal = goalStatus === "active";
      if (tool === "create_goal" && openGoal) {
        goalRecovery = {
          reason: "Retained the existing active Codex Goal; recovery creates a Goal only when none is active.",
        };
        consumed.add(id);
        continue;
      }
      if (tool === "update_goal" && goalStatus !== "active") {
        consumed.add(id);
        continue;
      }
    }
    await handler(inputRecord);
    consumed.add(id);
  }
  const visibleKeys = new Set([
    "stage",
    "planSummary",
    "nextsteps",
    "notes",
    "nextTask",
    "commandHints",
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
  if (result.command === "plan.done") {
    visibleKeys.add("planPath");
    visibleKeys.add("achievement");
    visibleKeys.add("knowledgeDispatch");
  }
  if (result.knowledgeDispatch) {
    visibleKeys.add("knowledgeDispatch");
  }
  if (result.command === "task.done") {
    visibleKeys.add("ok");
    visibleKeys.add("command");
  }
  const visibleResult = Object.fromEntries(
    Object.entries(result).filter(([key]) => visibleKeys.has(key)),
  );
  if (goalRecovery) visibleResult.goalRecovery = goalRecovery;
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
