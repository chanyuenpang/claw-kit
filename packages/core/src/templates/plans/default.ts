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
  onPlanStart?: {
    completeTask: true;
    status: "process.active";
  };
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
      title: "Discuss and finalize requirements with the configured planning skill",
      detail:
        "Use {{planningSkill}} to finish discussing the request with the user and prepare the smallest outcome-oriented task list. Complete this task only when the outcome and constraints are clear, material open questions are resolved, and the user has finished the discussion; a draft is not completion.",
      status: "pending",
      guidance: {
        onPlanStart: {
          completeTask: true,
          status: "process.active",
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
