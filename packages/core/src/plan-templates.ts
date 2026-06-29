import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ClawError } from "./errors.js";
import { defaultPlanTemplate, type SeedPlanTemplate } from "./templates/plans/default.js";

const PLAN_TEMPLATES: SeedPlanTemplate[] = [defaultPlanTemplate];

export async function resolveSeedPlanTemplate(params: {
  projectRoot?: string;
  templateName?: string | null;
}): Promise<SeedPlanTemplate> {
  const normalized = params.templateName?.trim().toLowerCase() || defaultPlanTemplate.id;
  const projectTemplate = params.projectRoot ? await loadProjectSeedTemplate(params.projectRoot, normalized) : null;
  if (projectTemplate) {
    return projectTemplate;
  }
  const match = PLAN_TEMPLATES.find((template) =>
    template.id.toLowerCase() === normalized || template.aliases.some((alias) => alias.toLowerCase() === normalized),
  );
  if (!match) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown plan template "${params.templateName ?? normalized}".`, {
      templateName: params.templateName ?? normalized,
      availableTemplates: PLAN_TEMPLATES.flatMap((template) => [template.id, ...template.aliases]),
    });
  }
  return match;
}

async function loadProjectSeedTemplate(projectRoot: string, normalizedTemplateName: string): Promise<SeedPlanTemplate | null> {
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
  const templatePath = path.join(templatesDir, candidateEntries[0]!);
  const raw = templatePath.endsWith(".json")
    ? JSON.parse(fs.readFileSync(templatePath, "utf-8"))
    : await import(pathToFileURL(templatePath).href).then((module) => module.default ?? module);
  return validateSeedPlanTemplate(raw, templatePath);
}

function validateSeedPlanTemplate(raw: unknown, templatePath: string): SeedPlanTemplate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid plan template at ${templatePath}.`, {
      templatePath,
    });
  }
  const candidate = raw as Partial<SeedPlanTemplate>;
  const aliasesValid = Array.isArray(candidate.aliases) && candidate.aliases.every((alias) => typeof alias === "string");
  if (
    typeof candidate.id !== "string" ||
    !aliasesValid ||
    typeof candidate.planningEnabledStatus !== "string" ||
    typeof candidate.planningDisabledStatus !== "string" ||
    typeof candidate.planningTask?.title !== "string" ||
    typeof candidate.planningTask?.detail !== "string" ||
    typeof candidate.activationTask?.title !== "string" ||
    typeof candidate.activationTask?.detail !== "string" ||
    typeof candidate.activationTask?.goalModeDetail !== "string"
  ) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Invalid plan template at ${templatePath}.`, {
      templatePath,
    });
  }
  return candidate as SeedPlanTemplate;
}

export function renderSeedTemplateText(
  template: string,
  vars: {
    planningSkill: string;
  },
): string {
  return template.replace(/{{\s*planningSkill\s*}}/g, vars.planningSkill);
}
