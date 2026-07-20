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
  version: "0.1.88",
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
      title: "Complete planning with the configured planning skill",
      detail:
        "Discuss and confirm the requirements and proposed solution with the user, then prepare the task list.",
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
