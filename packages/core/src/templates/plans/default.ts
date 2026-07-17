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
      title: "Analyze the request and fill executable tasks with the planning skill",
      detail:
        "Analyze the request and use {{planningSkill}} to plan and fill executable tasks in `tasks`. If the request is still unclear, fill `requirements` first, then append the smallest handoff-ready downstream task list. Keep the pre-seeded activation task. Planning skill: {{planningSkill}}.",
      status: "pending",
      guidance: {
        onDone: {
          default: {
            mergeMode: "override",
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
