import fs from "node:fs";
import os from "node:os";
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
  version: string;
  scope?: "session";
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
const CURRENT_TEMPLATE_VERSION = defaultPlanTemplate.version;
const CREATE_CLAW_SKILL = "claw-kit:create-claw-skill";

export async function resolveSeedPlanTemplate(params: {
  projectRoot?: string;
  templateName?: string | null;
  templateFile?: string | null;
}): Promise<ResolvedPlanTemplate> {
  if (params.templateFile?.trim()) {
    return resolvePlanTemplateFile(params.templateFile);
  }
  const normalized = params.templateName?.trim().toLowerCase() || defaultPlanTemplate.id;
  const projectTemplate = params.projectRoot ? await loadProjectPlanTemplate(params.projectRoot, normalized) : null;
  if (projectTemplate) {
    return projectTemplate;
  }
  const projectSkillTemplate = params.projectRoot ? await loadProjectSkillPlanTemplate(params.projectRoot, normalized) : null;
  if (projectSkillTemplate) {
    return projectSkillTemplate;
  }
  const projectPackageTemplate = params.projectRoot ? await loadProjectPackagePlanTemplate(params.projectRoot, normalized) : null;
  if (projectPackageTemplate) {
    return projectPackageTemplate;
  }
  const globalTemplate = await loadGlobalPlanTemplate(normalized);
  if (globalTemplate) {
    return globalTemplate;
  }
  const globalSkillTemplate = await loadGlobalSkillPlanTemplate(normalized);
  if (globalSkillTemplate) {
    return globalSkillTemplate;
  }
  const globalPackageTemplate = await loadGlobalPackagePlanTemplate(normalized);
  if (globalPackageTemplate) {
    return globalPackageTemplate;
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
  const raw = await loadPlanTemplateSource(templatePath);
  return validatePlanTemplateSource(raw, templatePath, "project");
}

async function loadPlanTemplateSource(templatePath: string): Promise<unknown> {
  return templatePath.endsWith(".json")
    ? JSON.parse(fs.readFileSync(templatePath, "utf-8"))
    : import(pathToFileURL(templatePath).href).then((module) => module.default ?? module);
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
  return loadPlanTemplateFromDirectory(path.join(projectRoot, ".claw", "templates"), normalizedTemplateName);
}

async function loadProjectSkillPlanTemplate(projectRoot: string, normalizedTemplateName: string): Promise<ResolvedPlanTemplate | null> {
  return loadPlanTemplateFromSkillRoots(resolveProjectSkillRoots(projectRoot), normalizedTemplateName);
}

async function loadProjectPackagePlanTemplate(projectRoot: string, normalizedTemplateName: string): Promise<ResolvedPlanTemplate | null> {
  return loadPlanTemplateFromTemplateDirs(resolveProjectPackageTemplateDirs(projectRoot), normalizedTemplateName);
}

async function loadGlobalPlanTemplate(normalizedTemplateName: string): Promise<ResolvedPlanTemplate | null> {
  return loadPlanTemplateFromDirectory(path.join(os.homedir(), ".claw", "templates"), normalizedTemplateName);
}

async function loadGlobalSkillPlanTemplate(normalizedTemplateName: string): Promise<ResolvedPlanTemplate | null> {
  return loadPlanTemplateFromSkillRoots(resolveGlobalSkillRoots(), normalizedTemplateName);
}

async function loadGlobalPackagePlanTemplate(normalizedTemplateName: string): Promise<ResolvedPlanTemplate | null> {
  return loadPlanTemplateFromTemplateDirs(resolveGlobalPackageTemplateDirs(), normalizedTemplateName);
}

async function loadPlanTemplateFromDirectory(templatesDir: string, normalizedTemplateName: string): Promise<ResolvedPlanTemplate | null> {
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

async function loadPlanTemplateFromTemplateDirs(templateDirs: string[], normalizedTemplateName: string): Promise<ResolvedPlanTemplate | null> {
  const matches: string[] = [];
  for (const templateDir of templateDirs) {
    const match = await loadPlanTemplateFromDirectory(templateDir, normalizedTemplateName);
    if (match?.templatePath) {
      matches.push(match.templatePath);
    }
  }
  if (matches.length > 1) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Multiple package plan templates matched "${normalizedTemplateName}".`, {
      templateName: normalizedTemplateName,
      candidatePaths: matches,
    });
  }
  return matches.length === 1 ? resolvePlanTemplateFile(matches[0]!) : null;
}

async function loadPlanTemplateFromSkillRoots(skillRoots: string[], normalizedTemplateName: string): Promise<ResolvedPlanTemplate | null> {
  const matches: { path: string; signature: string; template: ResolvedPlanTemplate }[] = [];
  for (const skillRoot of skillRoots) {
    for (const templatePath of collectSkillTemplateFiles(skillRoot)) {
      const raw = await loadPlanTemplateSource(templatePath);
      const rawId = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).id
        : undefined;
      if (typeof rawId === "string" && rawId.toLowerCase() === normalizedTemplateName) {
        const template = validatePlanTemplateSource(raw, templatePath, "project");
        matches.push({ path: templatePath, signature: signatureForTemplateConflict(template), template });
      }
    }
  }
  if (matches.length > 1) {
    const uniqueSignatures = new Set(matches.map((match) => match.signature));
    if (uniqueSignatures.size === 1) {
      return matches[0]!.template;
    }
    throw new ClawError("PROJECT_CONFIG_INVALID", `Multiple skill-local plan templates matched "${normalizedTemplateName}".`, {
      templateName: normalizedTemplateName,
      candidatePaths: matches.map((match) => match.path),
    });
  }
  return matches.length === 1 ? matches[0]!.template : null;
}

function signatureForTemplateConflict(template: ResolvedPlanTemplate): string {
  const { source: _source, templatePath: _templatePath, ...portableTemplate } = template;
  return JSON.stringify(portableTemplate);
}

function resolveProjectSkillRoots(projectRoot: string): string[] {
  const roots = [path.join(projectRoot, "skills")];
  const packagesDir = path.join(projectRoot, "packages");
  if (!fs.existsSync(packagesDir)) {
    return roots;
  }
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    roots.push(path.join(packagesDir, entry.name, "skills"));
  }
  return roots;
}

function resolveProjectPackageTemplateDirs(projectRoot: string): string[] {
  const templateDirs: string[] = [];
  const packagesDir = path.join(projectRoot, "packages");
  if (!fs.existsSync(packagesDir)) {
    return templateDirs;
  }
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    templateDirs.push(path.join(packagesDir, entry.name, "templates"));
  }
  return templateDirs;
}

function resolveGlobalSkillRoots(): string[] {
  const homeDir = os.homedir();
  const roots = [
    path.join(homeDir, ".agents", "skills"),
    path.join(homeDir, ".codex", "skills"),
  ];
  const cacheRoot = path.join(homeDir, ".codex", "plugins", "cache");
  if (fs.existsSync(cacheRoot)) {
    for (const vendor of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!vendor.isDirectory()) {
        continue;
      }
      const vendorDir = path.join(cacheRoot, vendor.name);
      for (const plugin of fs.readdirSync(vendorDir, { withFileTypes: true })) {
        if (!plugin.isDirectory()) {
          continue;
        }
        const pluginDir = path.join(vendorDir, plugin.name);
        roots.push(path.join(pluginDir, "skills"));
        for (const version of fs.readdirSync(pluginDir, { withFileTypes: true })) {
          if (!version.isDirectory()) {
            continue;
          }
          roots.push(path.join(pluginDir, version.name, "skills"));
        }
      }
    }
  }
  return roots;
}

function resolveGlobalPackageTemplateDirs(): string[] {
  const homeDir = os.homedir();
  const templateDirs: string[] = [];
  const cacheRoot = path.join(homeDir, ".codex", "plugins", "cache");
  if (!fs.existsSync(cacheRoot)) {
    return templateDirs;
  }
  for (const vendor of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!vendor.isDirectory()) {
      continue;
    }
    const vendorDir = path.join(cacheRoot, vendor.name);
    for (const plugin of fs.readdirSync(vendorDir, { withFileTypes: true })) {
      if (!plugin.isDirectory()) {
        continue;
      }
      const pluginDir = path.join(vendorDir, plugin.name);
      templateDirs.push(path.join(pluginDir, "templates"));
      for (const version of fs.readdirSync(pluginDir, { withFileTypes: true })) {
        if (!version.isDirectory()) {
          continue;
        }
        templateDirs.push(path.join(pluginDir, version.name, "templates"));
      }
    }
  }
  return templateDirs;
}

function collectSkillTemplateFiles(skillRoot: string): string[] {
  if (!fs.existsSync(skillRoot)) {
    return [];
  }
  const templateFiles: string[] = [];
  for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillDir = path.join(skillRoot, entry.name);
    for (const candidateName of [
      "TEMPLATE.json",
      "TEMPLATE.js",
      "TEMPLATE.mjs",
      "TEMPLATE.cjs",
      "CLAW-TEMPLATE.json",
      "CLAW-TEMPLATE.js",
      "CLAW-TEMPLATE.mjs",
      "CLAW-TEMPLATE.cjs",
    ]) {
      const candidatePath = path.join(skillDir, candidateName);
      if (fs.existsSync(candidatePath)) {
        templateFiles.push(candidatePath);
      }
    }
  }
  return templateFiles;
}

function validatePlanLikeTemplate(raw: unknown, templatePath: string): PlanTemplateDocument {
  const candidate = raw as Record<string, unknown>;
  const allowedKeys = new Set([
    "id",
    "version",
    "scope",
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
  if (candidate.scope !== undefined && candidate.scope !== "session") {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid template scope at ${templatePath}; expected "session".`, {
      templatePath,
      scope: candidate.scope,
    });
  }
  if (typeof candidate.id !== "string" || typeof candidate.status !== "string") {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid plan-like template header at ${templatePath}.`, {
      templatePath,
    });
  }
  assertCompatibleTemplateVersion(candidate.version, templatePath);
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

function assertCompatibleTemplateVersion(value: unknown, templatePath: string): asserts value is string {
  const templateVersion = typeof value === "string" ? value.trim() : "";
  const parsedTemplateVersion = parseTemplateSemver(templateVersion);
  const currentVersion = parseTemplateSemver(CURRENT_TEMPLATE_VERSION);
  if (parsedTemplateVersion && currentVersion && compareTemplateSemver(parsedTemplateVersion, currentVersion) >= 0) {
    return;
  }

  const reason = !templateVersion
    ? "missing_version"
    : !parsedTemplateVersion
      ? "invalid_version"
      : "older_version";
  throw new ClawError(
    "PROJECT_CONFIG_INVALID",
    `Template out of date. Use ${CREATE_CLAW_SKILL} to upgrade template.`,
    {
      templatePath,
      reason,
      templateVersion: templateVersion || null,
      cliVersion: CURRENT_TEMPLATE_VERSION,
      requiredSkill: CREATE_CLAW_SKILL,
      prompt: `Use ${CREATE_CLAW_SKILL} to upgrade the template at ${templatePath}. Inspect and optimize the skill package before setting version to ${CURRENT_TEMPLATE_VERSION}.`,
    },
  );
}

function parseTemplateSemver(value: string): [number, number, number] | null {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareTemplateSemver(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index]! - right[index]!;
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function normalizePlanLikeTemplate(
  template: PlanTemplateDocument,
  meta: { source: "builtin" | "project"; templatePath?: string },
): ResolvedPlanTemplate {
  return {
    id: template.id,
    version: template.version,
    scope: template.scope,
    configOverride: normalizeTemplateConfigOverride(template.configOverride),
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

export function getTemplateTaskPlanStartGuidance(
  template: ResolvedPlanTemplate,
  taskId: number,
): TemplateTaskGuidance["onPlanStart"] {
  return getTemplateTaskGuidance(template, taskId)?.onPlanStart;
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
    // Accepted only so older installed templates remain loadable; normalization discards it.
    "truthDispatch",
    "knowledgeWriter",
    "externalPlanningSkill",
    // Accepted only so older installed templates remain loadable; normalization migrates them.
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
  if (
    candidate.truthDispatch !== undefined
    && candidate.truthDispatch !== "per_task"
    && candidate.truthDispatch !== "final_only"
  ) {
    return false;
  }
  if (candidate.externalPlanningSkill !== undefined && candidate.externalPlanningSkill !== null && typeof candidate.externalPlanningSkill !== "string") {
    return false;
  }
  if (candidate.knowledgeWriter !== undefined && !isTemplateKnowledgeWriterConfig(candidate.knowledgeWriter)) {
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

function normalizeTemplateConfigOverride(value: unknown): TemplateConfigOverride | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const normalized: TemplateConfigOverride = {};
  if (typeof candidate.goalMode === "boolean") {
    normalized.goalMode = candidate.goalMode;
  }
  if (candidate.externalPlanningSkill === null || typeof candidate.externalPlanningSkill === "string") {
    normalized.externalPlanningSkill = candidate.externalPlanningSkill;
  }
  const writer = candidate.knowledgeWriter && typeof candidate.knowledgeWriter === "object"
    ? candidate.knowledgeWriter as Record<string, unknown>
    : null;
  const hasCanonicalExternalSkill = writer
    ? Object.prototype.hasOwnProperty.call(writer, "externalSkill")
    : false;
  const truthSkill = normalizeTemplateSkill(candidate.externalTruthSkill);
  const adrSkill = normalizeTemplateSkill(candidate.externalAdrSkill);
  const migratedExternalSkill = truthSkill && adrSkill && truthSkill !== adrSkill
    ? null
    : truthSkill ?? adrSkill;
  const normalizedWriter = {
    ...(hasCanonicalExternalSkill
      ? { externalSkill: normalizeTemplateSkill(writer?.externalSkill) }
      : (candidate.externalTruthSkill !== undefined || candidate.externalAdrSkill !== undefined)
        ? { externalSkill: migratedExternalSkill }
        : {}),
    ...(writer && Object.prototype.hasOwnProperty.call(writer, "model")
      ? { model: normalizeTemplateSkill(writer.model) }
      : {}),
    ...(writer && isKnowledgeWriterReasoningEffort(writer.reasoningEffort)
      ? { reasoningEffort: writer.reasoningEffort }
      : {}),
    ...(writer && Number.isInteger(writer.datedSectionsToKeep) && (writer.datedSectionsToKeep as number) >= 0
      ? { datedSectionsToKeep: writer.datedSectionsToKeep as number }
      : {}),
  };
  if (Object.keys(normalizedWriter).length > 0) {
    normalized.knowledgeWriter = normalizedWriter;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isTemplateKnowledgeWriterConfig(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !["externalSkill", "model", "reasoningEffort", "datedSectionsToKeep"].includes(key))) {
    return false;
  }
  for (const key of ["externalSkill", "model"]) {
    const field = candidate[key];
    if (field !== undefined && field !== null && typeof field !== "string") {
      return false;
    }
  }
  return (candidate.reasoningEffort === undefined || isKnowledgeWriterReasoningEffort(candidate.reasoningEffort))
    && (candidate.datedSectionsToKeep === undefined
      || (Number.isInteger(candidate.datedSectionsToKeep) && (candidate.datedSectionsToKeep as number) >= 0));
}

function isKnowledgeWriterReasoningEffort(value: unknown): value is "minimal" | "low" | "medium" | "high" | "xhigh" {
  return value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function normalizeTemplateSkill(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isTemplateTaskGuidance(value: unknown): value is TemplateTaskGuidance | undefined {
  if (value === undefined) {
    return true;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const allowedKeys = new Set(["onPlanStart", "onDone"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }
  if (candidate.onPlanStart !== undefined) {
    if (!candidate.onPlanStart || typeof candidate.onPlanStart !== "object" || Array.isArray(candidate.onPlanStart)) {
      return false;
    }
    const onPlanStart = candidate.onPlanStart as Record<string, unknown>;
    const allowedOnPlanStartKeys = new Set(["completeTask", "status"]);
    if (Object.keys(onPlanStart).some((key) => !allowedOnPlanStartKeys.has(key))) {
      return false;
    }
    if (onPlanStart.completeTask !== true || onPlanStart.status !== "process.active") {
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
    // Compatibility only: older installed plugin caches may still carry this
    // inert route metadata. Current templates and workflow guidance do not use it.
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
    (!Array.isArray(candidate.recommendedCommands)
      || candidate.recommendedCommands.some((command) =>
        typeof command !== "string"
        || !command.trim()
        || /{{\s*[a-zA-Z0-9_]+\s*}}/.test(command)))
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
