import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ClawError } from "./errors.js";
import {
  defaultPlanTemplate,
  type PlanTemplateDocument,
  type PlanTemplateTask,
  type TemplateGuidanceRoute,
  type TemplateTaskGuidance,
} from "./templates/plans/default.js";
import type { PlanReference, PlanRequirements, PlanRetrospective, PlanStatus, TemplateConfigOverride } from "./types.js";

export type ResolvedPlanTemplate = {
  id: string;
  configOverride?: TemplateConfigOverride;
  title?: string;
  status: PlanStatus;
  goal?: {
    text: string;
  };
  requirements?: PlanRequirements;
  tasks: PlanTemplateTask[];
  references?: PlanReference[];
  rules?: string[];
  keyDecisions?: string[];
  retrospective?: PlanRetrospective;
  source: "builtin" | "project";
  templatePath?: string;
};

const PLAN_TEMPLATES: ResolvedPlanTemplate[] = [normalizePlanLikeTemplate(defaultPlanTemplate, { source: "builtin" })];

export async function resolveSeedPlanTemplate(params: {
  projectRoot?: string;
  templateName?: string | null;
}): Promise<ResolvedPlanTemplate> {
  const normalized = params.templateName?.trim().toLowerCase() || defaultPlanTemplate.id;
  const projectTemplate = params.projectRoot ? await loadProjectPlanTemplate(params.projectRoot, normalized) : null;
  if (projectTemplate) {
    return projectTemplate;
  }
  const match = PLAN_TEMPLATES.find((template) =>
    template.id.toLowerCase() === normalized,
  );
  if (!match) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown plan template "${params.templateName ?? normalized}".`, {
      templateName: params.templateName ?? normalized,
      availableTemplates: PLAN_TEMPLATES.map((template) => template.id),
    });
  }
  return match;
}

export async function resolvePlanTemplateFile(templatePath: string): Promise<ResolvedPlanTemplate> {
  const raw = templatePath.endsWith(".json")
    ? JSON.parse(fs.readFileSync(templatePath, "utf-8"))
    : await import(pathToFileURL(templatePath).href).then((module) => module.default ?? module);
  return validatePlanTemplateSource(raw, templatePath, "project");
}

export function validatePlanTemplateSource(
  raw: unknown,
  templatePath: string,
  source: "builtin" | "project" = "project",
): ResolvedPlanTemplate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid plan template at ${templatePath}.`, {
      templatePath,
    });
  }

  return normalizePlanLikeTemplate(validatePlanLikeTemplate(raw, templatePath), {
    source,
    templatePath: source === "project" ? templatePath : undefined,
  });
}

async function loadProjectPlanTemplate(projectRoot: string, normalizedTemplateName: string): Promise<ResolvedPlanTemplate | null> {
  const templatesDir = path.join(projectRoot, ".claw", "templates");
  if (!fs.existsSync(templatesDir)) {
    return null;
  }
  const candidateEntries = fs.readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((entryName) => {
      const parsed = path.parse(entryName);
      return parsed.name.toLowerCase() === normalizedTemplateName && [".json", ".js", ".mjs", ".cjs"].includes(parsed.ext.toLowerCase());
    });
  if (candidateEntries.length === 0) {
    return null;
  }
  if (candidateEntries.length > 1) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Multiple project plan templates matched "${normalizedTemplateName}".`, {
      templateName: normalizedTemplateName,
      candidatePaths: candidateEntries.map((entryName) => path.join(templatesDir, entryName)),
    });
  }
  return resolvePlanTemplateFile(path.join(templatesDir, candidateEntries[0]!));
}

function validatePlanLikeTemplate(raw: unknown, templatePath: string): PlanTemplateDocument {
  const candidate = raw as Record<string, unknown>;
  const allowedKeys = new Set([
    "id",
    "configOverride",
    "title",
    "status",
    "goal",
    "requirements",
    "tasks",
    "references",
    "rules",
    "keyDecisions",
    "retrospective",
  ]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid plan-like template field "${key}" at ${templatePath}.`, {
        templatePath,
        field: key,
      });
    }
  }

  if (!isTemplateConfigOverride(candidate.configOverride)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template configOverride at ${templatePath}.`, {
      templatePath,
    });
  }
  if (typeof candidate.id !== "string" || typeof candidate.status !== "string") {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid plan-like template header at ${templatePath}.`, {
      templatePath,
    });
  }
  if (candidate.title !== undefined && typeof candidate.title !== "string") {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template title at ${templatePath}.`, {
      templatePath,
    });
  }
  if (candidate.goal !== undefined) {
    if (!candidate.goal || typeof candidate.goal !== "object" || Array.isArray(candidate.goal)) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template goal at ${templatePath}.`, {
        templatePath,
      });
    }
    const goal = candidate.goal as Record<string, unknown>;
    if (goal.text !== undefined && typeof goal.text !== "string") {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template goal.text at ${templatePath}.`, {
        templatePath,
      });
    }
  }
  if (candidate.requirements !== undefined && !isPlanRequirements(candidate.requirements)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template requirements at ${templatePath}.`, {
      templatePath,
    });
  }
  if (!Array.isArray(candidate.tasks)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Template tasks must be an array at ${templatePath}.`, {
      templatePath,
    });
  }
  for (const task of candidate.tasks) {
    if (!isPlanTemplateTask(task)) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template task at ${templatePath}.`, {
        templatePath,
      });
    }
  }
  if (candidate.references !== undefined && !isPlanReferences(candidate.references)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template references at ${templatePath}.`, {
      templatePath,
    });
  }
  if (candidate.rules !== undefined && (!Array.isArray(candidate.rules) || candidate.rules.some((item) => typeof item !== "string"))) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template rules at ${templatePath}.`, {
      templatePath,
    });
  }
  if (
    candidate.keyDecisions !== undefined
    && (!Array.isArray(candidate.keyDecisions) || candidate.keyDecisions.some((item) => typeof item !== "string"))
  ) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template keyDecisions at ${templatePath}.`, {
      templatePath,
    });
  }
  if (candidate.retrospective !== undefined && !isPlanRetrospective(candidate.retrospective)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template retrospective at ${templatePath}.`, {
      templatePath,
    });
  }

  return raw as PlanTemplateDocument;
}

function normalizePlanLikeTemplate(
  template: PlanTemplateDocument,
  meta: { source: "builtin" | "project"; templatePath?: string },
): ResolvedPlanTemplate {
  return {
    id: template.id,
    configOverride: template.configOverride,
    title: template.title,
    status: template.status,
    goal: template.goal,
    requirements: template.requirements,
    tasks: template.tasks,
    references: template.references,
    rules: template.rules,
    keyDecisions: template.keyDecisions,
    retrospective: template.retrospective,
    source: meta.source,
    templatePath: meta.templatePath,
  };
}

export function getTemplateTaskDoneChoices(template: ResolvedPlanTemplate, taskId: number): Record<string, TemplateGuidanceRoute> | undefined {
  return getTemplateTaskGuidance(template, taskId)?.onDone?.choices;
}

export function getTemplateTaskDoneGuidanceRoute(
  template: ResolvedPlanTemplate,
  taskId: number,
  choiceId?: string,
): TemplateGuidanceRoute | undefined {
  const onDone = getTemplateTaskGuidance(template, taskId)?.onDone;
  if (!onDone) {
    return undefined;
  }
  if (choiceId && onDone.choices && Object.prototype.hasOwnProperty.call(onDone.choices, choiceId)) {
    return onDone.choices[choiceId];
  }
  return onDone.default;
}

export function getTemplateTaskGuidance(template: ResolvedPlanTemplate, taskId: number): TemplateTaskGuidance | undefined {
  return template.tasks.find((task) => task.id === taskId)?.guidance;
}

function isPlanRequirements(value: unknown): value is PlanRequirements {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.summary === "string"
    && Array.isArray(candidate.openQuestions)
    && candidate.openQuestions.every((item) => typeof item === "string")
    && Array.isArray(candidate.acceptanceCriteria)
    && candidate.acceptanceCriteria.every((item) => typeof item === "string");
}

function isPlanReferences(value: unknown): value is PlanReference[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((reference) =>
    reference
    && typeof reference === "object"
    && !Array.isArray(reference)
    && typeof (reference as Record<string, unknown>).path === "string"
    && typeof (reference as Record<string, unknown>).why === "string");
}

function isPlanRetrospective(value: unknown): value is PlanRetrospective {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.summary !== "string") {
    return false;
  }
  for (const key of ["whatWorked", "issues", "followUps", "knowledgeCandidates"]) {
    const field = candidate[key];
    if (field !== undefined && (!Array.isArray(field) || field.some((item) => typeof item !== "string"))) {
      return false;
    }
  }
  return true;
}

function isPlanTemplateTask(value: unknown): value is PlanTemplateTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "id",
    "title",
    "detail",
    "status",
    "guidance",
    "goalModeDetail",
    "execution",
    "sessionKey",
  ]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }
  if (!Number.isInteger(candidate.id)) {
    return false;
  }
  if (typeof candidate.title !== "string") {
    return false;
  }
  if (candidate.detail !== undefined && typeof candidate.detail !== "string") {
    return false;
  }
  if (
    candidate.status !== "pending"
    && candidate.status !== "in_progress"
    && candidate.status !== "subagent_running"
    && candidate.status !== "done"
    && candidate.status !== "blocked"
  ) {
    return false;
  }
  if (!isTemplateTaskGuidance(candidate.guidance)) {
    return false;
  }
  if (candidate.goalModeDetail !== undefined && typeof candidate.goalModeDetail !== "string") {
    return false;
  }
  if (candidate.execution !== undefined) {
    if (!candidate.execution || typeof candidate.execution !== "object" || Array.isArray(candidate.execution)) {
      return false;
    }
    const execution = candidate.execution as Record<string, unknown>;
    if (
      execution.type !== undefined
      && execution.type !== "default"
      && execution.type !== "subagent"
      && execution.type !== "subplan"
    ) {
      return false;
    }
    if (execution.subplan !== undefined && typeof execution.subplan !== "string") {
      return false;
    }
    if (execution.planPath !== undefined && typeof execution.planPath !== "string") {
      return false;
    }
  }
  if (candidate.sessionKey !== undefined && typeof candidate.sessionKey !== "string") {
    return false;
  }
  return true;
}

function isTemplateConfigOverride(value: unknown): value is TemplateConfigOverride | undefined {
  if (value === undefined) {
    return true;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const allowedKeys = new Set([
    "goalMode",
    "truthDispatch",
    "externalPlanningSkill",
    "externalTruthSkill",
    "externalAdrSkill",
  ]);
  const candidate = value as Record<string, unknown>;
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }

  if (candidate.goalMode !== undefined && typeof candidate.goalMode !== "boolean") {
    return false;
  }
  if (candidate.truthDispatch !== undefined && candidate.truthDispatch !== "per_task" && candidate.truthDispatch !== "final_only") {
    return false;
  }
  if (candidate.externalPlanningSkill !== undefined && candidate.externalPlanningSkill !== null && typeof candidate.externalPlanningSkill !== "string") {
    return false;
  }
  if (candidate.externalTruthSkill !== undefined && candidate.externalTruthSkill !== null && typeof candidate.externalTruthSkill !== "string") {
    return false;
  }
  if (candidate.externalAdrSkill !== undefined && candidate.externalAdrSkill !== null && typeof candidate.externalAdrSkill !== "string") {
    return false;
  }

  return true;
}

function isTemplateTaskGuidance(value: unknown): value is TemplateTaskGuidance | undefined {
  if (value === undefined) {
    return true;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const allowedKeys = new Set(["onDone"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }
  if (candidate.onDone === undefined) {
    return true;
  }
  if (!candidate.onDone || typeof candidate.onDone !== "object" || Array.isArray(candidate.onDone)) {
    return false;
  }
  const onDone = candidate.onDone as Record<string, unknown>;
  const allowedOnDoneKeys = new Set(["default", "choices"]);
  for (const key of Object.keys(onDone)) {
    if (!allowedOnDoneKeys.has(key)) {
      return false;
    }
  }
  if (onDone.default !== undefined && !isTemplateGuidanceRoute(onDone.default)) {
    return false;
  }
  if (onDone.choices !== undefined) {
    if (!onDone.choices || typeof onDone.choices !== "object" || Array.isArray(onDone.choices)) {
      return false;
    }
    for (const [choiceId, route] of Object.entries(onDone.choices as Record<string, unknown>)) {
      if (!choiceId.trim() || !isTemplateGuidanceRoute(route)) {
        return false;
      }
    }
  }
  return true;
}

function isTemplateGuidanceRoute(value: unknown): value is TemplateGuidanceRoute {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "mergeMode",
    "summary",
    "nextsteps",
    "notes",
    "recommendedCommands",
    "nextTaskId",
    "label",
    "delegateTruth",
  ]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }
  if (candidate.mergeMode !== undefined && candidate.mergeMode !== "override" && candidate.mergeMode !== "replace") {
    return false;
  }
  if (candidate.summary !== undefined && typeof candidate.summary !== "string") {
    return false;
  }
  if (candidate.nextsteps !== undefined && (!Array.isArray(candidate.nextsteps) || candidate.nextsteps.some((step) => typeof step !== "string"))) {
    return false;
  }
  if (candidate.notes !== undefined && typeof candidate.notes !== "string") {
    return false;
  }
  if (
    candidate.recommendedCommands !== undefined &&
    (!Array.isArray(candidate.recommendedCommands) || candidate.recommendedCommands.some((command) => typeof command !== "string"))
  ) {
    return false;
  }
  if (candidate.nextTaskId !== undefined && !Number.isInteger(candidate.nextTaskId)) {
    return false;
  }
  if (candidate.label !== undefined && typeof candidate.label !== "string") {
    return false;
  }
  if (candidate.delegateTruth !== undefined && typeof candidate.delegateTruth !== "boolean") {
    return false;
  }
  if (candidate.mergeMode === "replace") {
    if (typeof candidate.summary !== "string") {
      return false;
    }
    if (!Array.isArray(candidate.nextsteps) || candidate.nextsteps.some((step) => typeof step !== "string")) {
      return false;
    }
  }
  if (
    candidate.mergeMode !== "replace"
    && candidate.summary === undefined
    && candidate.nextsteps === undefined
    && candidate.notes === undefined
    && candidate.recommendedCommands === undefined
    && candidate.nextTaskId === undefined
    && candidate.label === undefined
    && candidate.delegateTruth === undefined
  ) {
    return false;
  }
  return true;
}

export function renderSeedTemplateText(
  template: string,
  vars: {
    planningSkill: string;
  },
): string {
  return template.replace(/{{\s*planningSkill\s*}}/g, vars.planningSkill);
}
