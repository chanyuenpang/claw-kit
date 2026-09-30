import { ClawError } from "@veewo/claw-core";
import type { ClawCommandRequest } from "./command-service.js";

// Closed wire boundary. Domain validation still belongs to core; this decoder
// validates shape and authority before any registry/focus preparation can run.
type Check = (value: unknown) => boolean;
const text: Check = (v) => typeof v === "string";
const bool: Check = (v) => typeof v === "boolean";
const id: Check = (v) => Number.isSafeInteger(v) && Number(v) > 0;
const list = (check: Check): Check => (v) => Array.isArray(v) && v.every(check);
const oneOf = (...values: string[]): Check => (v) => typeof v === "string" && values.includes(v);
const object = (fields: Record<string, Check>, required: string[] = []): Check => (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const value = v as Record<string, unknown>;
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => Object.hasOwn(fields, key) && fields[key]!(value[key]));
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
const task = object({ title: text, detail: text }, ["title"]);
const mutationChecks: Record<string, Check> = {
  "plan.update": object({ type: text, updates: object(fields) }, ["type", "updates"]),
  "plan.status": object({ type: text, status: text }, ["type", "status"]),
  "task.add": object({ type: text, title: text, detail: text }, ["type", "title"]),
  "task.edit": object({ type: text, id, title: text, detail: text, status: taskStatus, choiceId: text }, ["type", "id"]),
  "task.remove": object({ type: text, id }, ["type", "id"]),
};
const mutation: Check = (v) => {
  const type = (v as { type?: unknown } | null)?.type;
  return typeof type === "string" && Object.hasOwn(mutationChecks, type) && mutationChecks[type]!(v);
};
const finalizeId: Check = (v) => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v);
const checks = {
  "plan.create": object({ title: text, taskName: text, goalText: text, description: text,
    scope: oneOf("project", "session"), knowledgeCapture: bool, templateName: text,
    templateFile: text, planStatus: text, forcePlanning: bool }),
  "plan.start": object({ updates: object(fields), appendTasks: list(task) }),
  "plan.resume": object({ planId: text }),
  "plan.leave": object({}),
  "plan.show": object({ simple: bool }),
  "plan.edit": object({ operations: list(mutation) }, ["operations"]),
  "plan.wait": object({}),
  "plan.done": object(fields),
  "subplan.create": object({ parentTaskName: text, parentTaskId: id, templateName: text, templateFile: text }, ["parentTaskName", "parentTaskId"]),
  "task.edit": object({ taskId: id, taskTitle: text, taskDetail: text, taskStatus, taskChoiceId: text }, ["taskId"]),
  "task.add": object({ tasks: list(task) }, ["tasks"]),
  "task.done": object({ tasks: list(object({ id, choiceId: text }, ["id"])) }, ["tasks"]),
  "search": object({ query: text, limit: id }, ["query"]),
  "search.index.refresh": object({}),
  "knowledge.claim": object({ finalizeId }, ["finalizeId"]),
  // Internal transport reconciliation only; no model-facing argument mapping.
  "knowledge.claim.receipt": object({ finalizeId }, ["finalizeId"]),
  "knowledge.done": (v: unknown) => object({ finalizeId, claimToken: text,
    status: oneOf("succeeded", "failed"), result: text, error: text }, ["finalizeId", "claimToken", "status"])(v)
    && ((v as { status: string }).status === "succeeded"
      ? object({ finalizeId, claimToken: text, status: text, result: text }, ["result"])(v)
      : object({ finalizeId, claimToken: text, status: text, error: text }, ["error"])(v)),
} satisfies Record<ClawCommandRequest["operation"], Check>;

export function decodeClawCommand(value: unknown, options?: { allowTerminalSearchDir?: boolean }): ClawCommandRequest {
  if (!object({ operation: text, input: () => true }, ["operation", "input"])(value)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Expected only operation and input.");
  }
  const request = value as { operation: string; input: unknown };
  if (!Object.hasOwn(checks, request.operation)) {
    throw new ClawError("SESSION_OPERATION_UNSUPPORTED", "Operation is outside the model command contract.", { operation: request.operation });
  }
  const check = request.operation === "search" && options?.allowTerminalSearchDir
    ? object({ query: text, limit: id, dir: text }, ["query"])
    : checks[request.operation as keyof typeof checks];
  if (!check(request.input)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", "Invalid or unsupported " + request.operation + " input.");
  }
  return request as ClawCommandRequest;
}
