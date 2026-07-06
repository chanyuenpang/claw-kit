import type {
  PlanReference,
  PlanRequirements,
  PlanRetrospective,
  PlanStatus,
  PlanTaskStatus,
  TemplateConfigOverride,
} from "../../types.js";

export type TemplateGuidanceRoute = {
  mergeMode?: "override" | "replace";
  summary?: string;
  nextsteps?: string[];
  notes?: string;
  recommendedCommands?: string[];
  nextTaskId?: number;
  label?: string;
  delegateTruth?: boolean;
};

export type TemplateTaskGuidance = {
  onDone?: {
    default?: TemplateGuidanceRoute;
    choices?: Record<string, TemplateGuidanceRoute>;
  };
};

export type PlanTemplateTask = {
  id: number;
  title: string;
  detail?: string;
  status: PlanTaskStatus;
  guidance?: TemplateTaskGuidance;
  goalModeDetail?: string;
  execution?: {
    type?: "default" | "subagent" | "subplan";
    subplan?: string;
    planPath?: string;
  };
  sessionKey?: string;
};

export type PlanTemplateDocument = {
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
};

export const defaultPlanTemplate: PlanTemplateDocument = {
  id: "default",
  status: "process.discussing",
  goal: {
    text: "",
  },
  requirements: {
    summary: "",
    openQuestions: [],
    acceptanceCriteria: [],
  },
  tasks: [
    {
      id: 1,
      title: "Use the planning skill to refine the request and append executable tasks",
      detail:
        "Use {{planningSkill}} to refine the request and append executable tasks into `tasks`. If the current request is still unclear, fill `requirements` first as part of the planning output, then append executable tasks. Keep the pre-seeded activation task and only append downstream work. Recommended planning skill: {{planningSkill}}.",
      status: "pending",
      guidance: {
        onDone: {
          default: {
            mergeMode: "override",
            delegateTruth: false,
          },
        },
      },
    },
    {
      id: 2,
      title: "Enter process.active",
      detail:
        "After the planning task appends the executable tasks, move the plan into `process.active` and continue execution from the refined task list.",
      goalModeDetail:
        "If Goal Mode is enabled for this project, start Goal Mode when entering `process.active`.",
      status: "pending",
      guidance: {
        onDone: {
          default: {
            mergeMode: "override",
            delegateTruth: false,
          },
        },
      },
    },
  ],
  references: [],
  rules: [],
  keyDecisions: [],
  retrospective: {
    summary: "",
  },
};
