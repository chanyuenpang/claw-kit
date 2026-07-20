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
  commandHints?: string[];
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
};

export const defaultPlanTemplate: PlanTemplateDocument = {
  id: "default",
  version: "0.1.90",
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
      title: "Complete planning with {{planningSkill}}",
      detail:
        "1. Determine whether the user's wording is an instruction to act or an open-ended discussion. 2. Use {{planningSkill}} to clarify the requirements and prepare the task list. 3. Before adopting the solution, ensure the user has seen its decision-relevant content; if it introduces a meaningful choice, wait for the user's response.",
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
