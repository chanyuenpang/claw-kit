import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ClawError } from "./errors.js";
import { defaultPlanTemplate, type SeedPlanTemplate } from "./templates/plans/default.js";
import type { PlanDocument } from "./types.js";

const PLAN_TEMPLATES: SeedPlanTemplate[] = [defaultPlanTemplate];
const PROJECT_TEMPLATE_EXTENSIONS = new Set([".json", ".js", ".mjs", ".cjs"]);

export type FullPlanTemplate = PlanDocument & {
  id: string;
};

export type ResolvedPlanTemplate =
  | { kind: "seed"; template: SeedPlanTemplate; templatePath?: string }
  | { kind: "full"; template: FullPlanTemplate; templatePath: string };

export async function resolvePlanTemplate(params: {
  projectRoot?: string;
  templateName?: string | null;
  host?: string;
  skillRoots?: string[];
}): Promise<ResolvedPlanTemplate> {
  const normalized = params.templateName?.trim().toLowerCase() || defaultPlanTemplate.id;
  const projectCandidate = params.projectRoot
    ? await loadProjectPlanTemplate(params.projectRoot, normalized)
    : null;
  if (projectCandidate) {
    return projectCandidate;
  }

  const builtIn = PLAN_TEMPLATES.find((template) =>
    template.id.toLowerCase() === normalized || template.aliases.some((alias) => alias.toLowerCase() === normalized),
  );
  if (builtIn) {
    return { kind: "seed", template: builtIn };
  }

  const skillRoots = params.skillRoots ?? resolveHostSkillRoots({
    projectRoot: params.projectRoot,
    host: params.host,
  });
  const skillCandidate = loadSkillPlanTemplate(skillRoots, normalized);
  if (skillCandidate) {
    return skillCandidate;
  }

  throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown plan template "${params.templateName ?? normalized}".`, {
    templateName: params.templateName ?? normalized,
    availableTemplates: [
      ...PLAN_TEMPLATES.flatMap((template) => [template.id, ...template.aliases]),
      ...discoverSkillTemplateNames(skillRoots),
    ],
  });
}

export async function resolveSeedPlanTemplate(params: {
  projectRoot?: string;
  templateName?: string | null;
}): Promise<SeedPlanTemplate> {
  const resolved = await resolvePlanTemplate(params);
  if (resolved.kind !== "seed") {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Plan template "${params.templateName ?? resolved.template.id}" is a full-plan template, not a seed template.`, {
      templateName: params.templateName ?? resolved.template.id,
      templatePath: resolved.templatePath,
    });
  }
  return resolved.template;
}

export function resolveHostSkillRoots(params: {
  projectRoot?: string;
  host?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string[] {
  const env = params.env ?? process.env;
  const homeDir = params.homeDir ?? os.homedir();
  const explicitRoots = (env.CLAW_SKILL_ROOTS ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const roots = [...explicitRoots];
  if (params.projectRoot) {
    roots.push(path.join(params.projectRoot, "shared", "skills"));
  }
  roots.push(...discoverCheckoutSkillRoots());
  const host = params.host?.trim().toLowerCase();

  if (host === "opencode") {
    const guidanceConfig = env.CLAW_GUIDANCE_CONFIG?.trim();
    if (guidanceConfig) {
      roots.push(path.join(path.dirname(path.resolve(guidanceConfig)), "skills"));
    }
    const opencodeHome = path.join(homeDir, ".config", "opencode");
    roots.push(path.join(opencodeHome, "skills"));
    roots.push(path.join(opencodeHome, "plugins", "claw-kit", "skills"));
    if (params.projectRoot) {
      roots.push(path.join(params.projectRoot, ".opencode", "skills"));
    }
    roots.push(path.join(homeDir, ".agents", "skills"));
    return uniqueExistingDirectories(roots);
  }

  const codexHome = env.CODEX_HOME?.trim() || path.join(homeDir, ".codex");
  roots.push(path.join(codexHome, "skills"));
  roots.push(...discoverCodexPluginSkillRoots(path.join(codexHome, "plugins", "cache")));
  return uniqueExistingDirectories(roots);
}

function discoverCheckoutSkillRoots(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(moduleDir, "..", "..", "..", "shared", "skills"),
    path.resolve(moduleDir, "..", "..", "..", "..", "shared", "skills"),
  ];
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
      return parsed.name.toLowerCase() === normalizedTemplateName && PROJECT_TEMPLATE_EXTENSIONS.has(parsed.ext.toLowerCase());
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
  const templatePath = path.join(templatesDir, candidateEntries[0]!);
  const raw = templatePath.endsWith(".json")
    ? JSON.parse(fs.readFileSync(templatePath, "utf-8"))
    : await import(pathToFileURL(templatePath).href).then((module) => module.default ?? module);
  return classifyPlanTemplate(raw, templatePath);
}

function loadSkillPlanTemplate(skillRoots: string[], normalizedTemplateName: string): ResolvedPlanTemplate | null {
  for (const skillRoot of skillRoots) {
    const templatePath = path.basename(skillRoot).toLowerCase() === normalizedTemplateName
      ? path.join(skillRoot, "TEMPLATE.json")
      : path.join(skillRoot, normalizedTemplateName, "TEMPLATE.json");
    if (!fs.existsSync(templatePath)) {
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
    const resolved = classifyPlanTemplate(raw, templatePath);
    if (resolved.kind !== "full") {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Skill-local plan template at ${templatePath} must use the full-plan template schema.`, {
        templatePath,
      });
    }
    if (resolved.template.id.trim().toLowerCase() !== normalizedTemplateName) {
      throw new ClawError("PROJECT_CONFIG_INVALID", `Skill-local plan template id does not match "${normalizedTemplateName}".`, {
        templatePath,
        templateId: resolved.template.id,
      });
    }
    return resolved;
  }
  return null;
}

function classifyPlanTemplate(raw: unknown, templatePath: string): ResolvedPlanTemplate {
  if (isSeedPlanTemplate(raw)) {
    return { kind: "seed", template: raw, templatePath };
  }
  if (isFullPlanTemplate(raw)) {
    return { kind: "full", template: raw, templatePath };
  }
  throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid plan template at ${templatePath}.`, {
    templatePath,
  });
}

function isSeedPlanTemplate(raw: unknown): raw is SeedPlanTemplate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const candidate = raw as Partial<SeedPlanTemplate>;
  return typeof candidate.id === "string"
    && Array.isArray(candidate.aliases)
    && candidate.aliases.every((alias) => typeof alias === "string")
    && typeof candidate.planningEnabledStatus === "string"
    && typeof candidate.planningDisabledStatus === "string"
    && typeof candidate.planningTask?.title === "string"
    && typeof candidate.planningTask?.detail === "string"
    && typeof candidate.activationTask?.title === "string"
    && typeof candidate.activationTask?.detail === "string"
    && typeof candidate.activationTask?.goalModeDetail === "string";
}

function isFullPlanTemplate(raw: unknown): raw is FullPlanTemplate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const candidate = raw as Partial<FullPlanTemplate>;
  return typeof candidate.id === "string"
    && typeof candidate.title === "string"
    && typeof candidate.status === "string"
    && typeof candidate.goal?.text === "string"
    && Array.isArray(candidate.tasks);
}

function discoverCodexPluginSkillRoots(cacheRoot: string): string[] {
  if (!fs.existsSync(cacheRoot)) {
    return [];
  }
  const roots: string[] = [];
  for (const marketplace of fs.readdirSync(cacheRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const marketplaceDir = path.join(cacheRoot, marketplace.name);
    for (const plugin of fs.readdirSync(marketplaceDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      if (plugin.name.toLowerCase() !== "claw-kit") {
        continue;
      }
      const pluginDir = path.join(marketplaceDir, plugin.name);
      const versions = fs.readdirSync(pluginDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" }));
      for (const version of versions) {
        roots.push(path.join(pluginDir, version, "skills"));
      }
    }
  }
  return roots;
}

function discoverSkillTemplateNames(skillRoots: string[]): string[] {
  const names = new Set<string>();
  for (const skillRoot of skillRoots) {
    if (!fs.existsSync(skillRoot)) {
      continue;
    }
    for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(skillRoot, entry.name, "TEMPLATE.json"))) {
        names.add(entry.name);
      }
    }
  }
  return [...names].sort();
}

function uniqueExistingDirectories(candidates: string[]): string[] {
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))]
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
}

export function renderSeedTemplateText(
  template: string,
  vars: {
    planningSkill: string;
  },
): string {
  return template.replace(/{{\s*planningSkill\s*}}/g, vars.planningSkill);
}
