import type { PlanStatus } from "../../types.js";

export type SeedPlanTemplate = {
  id: string;
  aliases: string[];
  planningEnabledStatus: PlanStatus;
  planningDisabledStatus: PlanStatus;
  planningTask: {
    title: string;
    detail: string;
  };
  activationTask: {
    title: string;
    detail: string;
    goalModeDetail: string;
  };
};

export const defaultPlanTemplate: SeedPlanTemplate = {
  id: "default",
  aliases: [],
  planningEnabledStatus: "process.discussing",
  planningDisabledStatus: "process.active",
  planningTask: {
    title: "Use the planning skill to refine the request and append executable tasks",
    detail:
      "Use {{planningSkill}} to refine the request and append executable tasks into `tasks`. If the current request is still unclear, fill `requirements` first as part of the planning output, then append executable tasks. Keep the pre-seeded activation task and only append downstream work. Recommended planning skill: {{planningSkill}}.",
  },
  activationTask: {
    title: "Enter process.active",
    detail:
      "After the planning task appends the executable tasks, move the plan into `process.active` and continue execution from the refined task list.",
    goalModeDetail:
      "If Goal Mode is enabled for this project, start Goal Mode when entering `process.active`.",
  },
};
