import { ClawError } from "./errors.js";
import { defaultPlanTemplate, type SeedPlanTemplate } from "./templates/plans/default.js";

const PLAN_TEMPLATES: SeedPlanTemplate[] = [defaultPlanTemplate];

export function resolveSeedPlanTemplate(templateName?: string | null): SeedPlanTemplate {
  const normalized = templateName?.trim().toLowerCase();
  if (!normalized) {
    return defaultPlanTemplate;
  }
  const match = PLAN_TEMPLATES.find((template) =>
    template.id.toLowerCase() === normalized || template.aliases.some((alias) => alias.toLowerCase() === normalized),
  );
  if (!match) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown plan template "${templateName}".`, {
      templateName,
      availableTemplates: PLAN_TEMPLATES.flatMap((template) => [template.id, ...template.aliases]),
    });
  }
  return match;
}

export function renderSeedTemplateText(
  template: string,
  vars: {
    planningSkill: string;
  },
): string {
  return template.replace(/{{\s*planningSkill\s*}}/g, vars.planningSkill);
}
