import type { PlanDocument, ProjectConfig } from "./types.js";

export function resolvePlanEffectiveConfig(
  projectConfig: ProjectConfig | null,
  plan: Pick<PlanDocument, "configOverride">,
): ProjectConfig | null {
  if (!projectConfig && !plan.configOverride) {
    return null;
  }
  return {
    ...(projectConfig ?? {}),
    ...(plan.configOverride ?? {}),
  };
}
