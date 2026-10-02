import type { KnowledgeWriterConfig, PlanDocument, ProjectConfig } from "./types.js";

/** Project/template/job readers share the same content-only writer projection. */
export function pickKnowledgeWriterFields(writer?: KnowledgeWriterConfig | null): KnowledgeWriterConfig {
  return Object.fromEntries(Object.entries(writer ?? {}).filter(([key]) =>
    ["externalSkills", "model", "reasoningEffort", "datedSectionsToKeep"].includes(key),
  ));
}

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
    ...((projectConfig?.knowledgeWriter || plan.configOverride?.knowledgeWriter)
      ? {
          knowledgeWriter: {
            ...pickKnowledgeWriterFields(projectConfig?.knowledgeWriter),
            ...pickKnowledgeWriterFields(plan.configOverride?.knowledgeWriter),
          },
        }
      : {}),
  };
}
