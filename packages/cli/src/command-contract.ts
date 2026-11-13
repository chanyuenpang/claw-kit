import { ClawError } from "@veewo/claw-core";
import type { ClawCommandRequest } from "./command-service.js";

// Closed wire boundary. Domain validation still belongs to core; this decoder
// validates shape and authority before any registry/focus preparation can run.
type InputIssue = { field: string; reason: string; message: string };
// Return the first actionable issue from the same check that owns acceptance.
// Never include input values; unusual/oversized field names are not echoed.
type Check = (value: unknown, field: string) => InputIssue | undefined;
const fieldPath = (parent: string, key: string): string =>
  parent + (/^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/.test(key) ? "." + key : "[unrecognized field]");
const expect = (expected: string, accepts: (value: unknown) => boolean): Check => (v, field) =>
  accepts(v) ? undefined : { field, reason: "invalid_value", message: "Field " + field + " must be " + expected + "." };
const text = expect("a string", (v) => typeof v === "string");
const bool = expect("a boolean", (v) => typeof v === "boolean");
const id = expect("a positive safe integer", (v) => Number.isSafeInteger(v) && Number(v) > 0);
const list = (check: Check): Check => (v, field) => {
  if (!Array.isArray(v)) return { field, reason: "invalid_type", message: "Field " + field + " must be an array." };
  for (let index = 0; index < v.length; index++) {
    // Match Array.every's treatment of sparse arrays for in-process callers.
    if (!(index in v)) continue;
    const issue = check(v[index], field + "[" + index + "]");
    if (issue) return issue;
  }
};
const oneOf = (...values: string[]): Check => expect("one of " + values.join(", "), (v) => typeof v === "string" && values.includes(v));
const object = (fields: Record<string, Check>, required: string[] = [], unknownHints: Record<string, string> = {}): Check => (v, field) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { field, reason: "invalid_type", message: "Field " + field + " must be an object." };
  const value = v as Record<string, unknown>;
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      const missing = fieldPath(field, key);
      return { field: missing, reason: "required", message: "Required field " + missing + " is missing." };
    }
  }
  for (const key of Object.keys(value)) {
    const child = fieldPath(field, key);
    if (!Object.hasOwn(fields, key)) return { field: child, reason: "unknown_field",
      message: "Unsupported field " + child + ". Allowed fields here: " + (Object.keys(fields).join(", ") || "none") + ". "
        + (Object.hasOwn(unknownHints, key) ? unknownHints[key] : "Remove the unsupported field.") };
    const issue = fields[key]!(value[key], child);
    if (issue) return issue;
  }
};
const fields = {
  goalText: text, requirementsSummary: text, planSummary: text, retrospectiveSummary: text,
  openQuestions: list(text), removeOpenQuestions: list(text), acceptanceCriteria: list(text),
  removeAcceptanceCriteria: list(text), rules: list(text), removeRules: list(text),
  keyDecisions: list(text), removeKeyDecisions: list(text), removeReferencePaths: list(text),
  whatWorked: list(text), issues: list(text), followUps: list(text),
  references: list(object({ path: text, why: text }, ["path", "why"])),
};
const taskStatus = oneOf("pending", "in_progress", "subagent_running", "done", "blocked");
const task = object({ title: text, detail: text }, ["title"], {
  status: "New tasks start as pending. Omit status; use task.edit or task.done for later state changes.",
});
const mutationChecks: Record<string, Check> = {
  "plan.update": object({ type: text, updates: object(fields) }, ["type", "updates"]),
  "plan.status": object({ type: text, status: text }, ["type", "status"]),
  "task.add": object({ type: text, title: text, detail: text }, ["type", "title"]),
  "task.edit": object({ type: text, id, title: text, detail: text, status: taskStatus, choiceId: text }, ["type", "id"]),
  "task.remove": object({ type: text, id }, ["type", "id"]),
};
const mutation: Check = (v, field) => {
  const type = (v as { type?: unknown } | null)?.type;
  const issue = oneOf(...Object.keys(mutationChecks))(type, fieldPath(field, "type"));
  return issue ?? mutationChecks[type as string]!(v, field);
};
const finalizeId = expect("a 64-character hexadecimal finalize ID", (v) => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v));
const checks = {
  "plan.create": object({ title: text, taskName: text, goalText: text, description: text,
    knowledgeCapture: bool, templateName: text,
    templateFile: text, planStatus: text, forcePlanning: bool, tasks: list(task) }),
  "plan.start": object({ updates: object(fields), appendTasks: list(task) }),
  "plan.resume": object({ planId: text }),
  "plan.leave": object({}),
  "plan.show": object({ simple: bool }),
  // Internal adapter precondition only; never mapped from model-facing arguments.
  "plan.edit": object({ operations: list(mutation), expectedPlanPath: text }, ["operations"]),
  "plan.wait": object({}),
  "plan.done": object(fields),
  "subplan.create": object({ parentTaskName: text, parentTaskId: id, templateName: text, templateFile: text }),
  "task.edit": object({ taskId: id, taskTitle: text, taskDetail: text, taskStatus, taskChoiceId: text }, ["taskId"]),
  "task.add": object({ tasks: list(task) }, ["tasks"]),
  "task.remove": object({ taskId: id, tasks: list(object({ id }, ["id"])) }),
  "task.done": object({ tasks: list(object({ id, choiceId: text }, ["id"])) }, ["tasks"]),
  "search": object({ query: text, limit: id }, ["query"]),
  "search.index.refresh": object({}),
  "knowledge.materials": object({ sourceSessionKey: text, sourcePlan: text }, ["sourceSessionKey", "sourcePlan"]),
  "knowledge.claim": object({ finalizeId }, ["finalizeId"]),
  // Internal transport reconciliation only; no model-facing argument mapping.
  "knowledge.claim.receipt": object({ finalizeId }, ["finalizeId"]),
  "knowledge.done.receipt": object({ finalizeId, claimToken: text, expectedStatus: oneOf("succeeded", "failed"), expectedResult: text }, ["finalizeId"]),
  "knowledge.done": (v: unknown, field: string) => object({ finalizeId, claimToken: text,
    status: oneOf("succeeded", "failed"), result: text, error: text }, ["finalizeId", "status"])(v, field)
    ?? ((v as { status: string }).status === "succeeded"
      ? object({ finalizeId, claimToken: text, status: text, result: text }, ["result"])(v, field)
      : object({ finalizeId, claimToken: text, status: text, error: text }, ["error"])(v, field)),
} satisfies Record<ClawCommandRequest["operation"], Check>;

export function decodeClawCommand(value: unknown, options?: { allowTerminalSearchDir?: boolean }): ClawCommandRequest {
  const execution = { operation: "command.decode", phase: "prepare", outcome: "known", effect: "none" } as const;
  const envelopeIssue = object({ operation: text, input: () => undefined }, ["operation", "input"])(value, "request");
  if (envelopeIssue) {
    throw new ClawError("COMMAND_INPUT_INVALID", "Invalid command request. " + envelopeIssue.message,
      { field: envelopeIssue.field, reason: envelopeIssue.reason }, execution);
  }
  const request = value as { operation: string; input: unknown };
  if (!Object.hasOwn(checks, request.operation)) {
    throw new ClawError("SESSION_OPERATION_UNSUPPORTED", "Operation is outside the model command contract. Use a supported operation from the current tool contract.", { field: "request.operation" }, execution);
  }
  const check = request.operation === "search" && options?.allowTerminalSearchDir
    ? object({ query: text, limit: id, dir: text }, ["query"])
    : checks[request.operation as keyof typeof checks];
  const issue = check(request.input, "input");
  if (issue) {
    throw new ClawError("COMMAND_INPUT_INVALID", "Invalid or unsupported " + request.operation + " input. " + issue.message,
      { field: issue.field, reason: issue.reason }, execution);
  }
  return request as ClawCommandRequest;
}
