export type ProjectConfig = {
  id?: string;
  name?: string;
  autoAchieveTask?: boolean;
  maxTasksToKeep?: number;
  contextPaths?: string[];
  memory?: {
    externalDocPaths?: string[];
  };
  gitnexus?: {
    enabled?: boolean;
  };
};

export type PlanPhase = "prepare" | "process" | "end";

export type PlanStatus =
  | "prepare.requirements"
  | "prepare.review"
  | "process.active"
  | "process.wait"
  | "process.discussing"
  | "end.completed"
  | "end.closed"
  | "end.leave";

export type LegacyPlanStatus =
  | "requirements"
  | "review"
  | "active"
  | "wait"
  | "discussing"
  | "completed"
  | "closed"
  | "leave";

export type PlanTaskStatus = "pending" | "in_progress" | "subagent_running" | "done" | "blocked";

export type PlanLeaveReason = "manual_leave" | "switch_to_new_plan";

export type TaskStatus = "active" | "completed" | "paused" | "interrupted" | "abandoned";

export type PlanReference = {
  why: string;
  path: string;
};

export type PlanRetrospective = {
  summary: string;
  whatWorked?: string[];
  issues?: string[];
  followUps?: string[];
  knowledgeCandidates?: string[];
};

export type PlanTaskReview = {
  dissatisfied: true;
  reason: string;
  reviewedAt: string;
};

export type PlanTask = {
  id: number;
  title: string;
  detail?: string;
  status: PlanTaskStatus;
  execution?: {
    type?: "default" | "subagent" | "subplan";
    subplan?: string;
    planPath?: string;
  };
  sessionKey?: string;
  review?: string | PlanTaskReview;
};

export type PlanDocument = {
  title: string;
  status: PlanStatus;
  goal: {
    text: string;
  };
  parentPlan?: string;
  parentTaskId?: number;
  summary?: string;
  leaveReason?: PlanLeaveReason;
  taskType?: string;
  tasks: PlanTask[];
  keyDecisions?: string[];
  references?: PlanReference[];
  rules?: string[];
  retrospective?: PlanRetrospective;
};

export type PlanReviewDimensions = {
  atomicity: number;
  stage_completeness: number;
  workflow_match: number;
  completion_clarity: number;
};

export type PlanReviewIssue = {
  severity: "error" | "warning";
  taskId: number | null;
  message: string;
};

export type PlanReviewResult = {
  score: number;
  matchedWorkflow: string;
  dimensions: PlanReviewDimensions;
  issues: PlanReviewIssue[];
  suggestions: string[];
  completionPolicy: "requires_user_confirmation" | "auto_completable";
};

export type WorkflowGuidanceOption = {
  id: string;
  label: string;
  description: string;
  recommended?: boolean;
};

export type WorkflowGuidanceSubagentName = "truth-writer" | "adr-writer";

export type WorkflowGuidanceSubagent = {
  name: WorkflowGuidanceSubagentName;
  waitForCompletion: boolean;
  preferReuseSameTypeInThread: true;
  inputContract: string;
  outputContract: string;
  closePolicy: "close_after_result" | "keep_open_for_reuse";
};

export type WorkflowGuidance = {
  stage: "requirements" | "review" | "discussion" | "execution" | "done" | "deposition" | "paused";
  summary: string;
  nextStep: string;
  notes?: string[];
  recommendedCommands?: string[];
  delegateSubagents?: WorkflowGuidanceSubagent[];
  goalMode?: {
    recommendedObjective: string;
    setWhen: "on_enter_process_active";
    ifNoActiveGoal: true;
    doNotOverwriteExisting: true;
    supportedSurfaces: Array<"/goal" | "create_goal">;
  };
  askUser?: {
    reason: string;
    useCodexOptions: true;
    options: WorkflowGuidanceOption[];
  };
};

export type PlanViewTask = {
  id: number;
  title: string;
  status: PlanTaskStatus;
  detail?: string;
};

export type PlanViewModel = {
  taskName: string;
  planFile: string;
  title: string;
  status: PlanStatus;
  collapsedSummary: string;
  counts: {
    completed: number;
    total: number;
  };
  goal: {
    text: string;
    defaultCollapsed: true;
  };
  tasks: {
    ordering: "unfinished_first_stable";
    items: PlanViewTask[];
  };
  expanded: {
    sections: Array<
      | {
          id: "goal";
          label: "Goal";
          type: "disclosure";
          defaultExpanded: false;
          content: {
            text: string;
          };
        }
      | {
          id: "tasks";
          label: "Tasks";
          type: "list";
          defaultExpanded: true;
          ordering: "unfinished_first_stable";
          items: PlanViewTask[];
        }
    >;
  };
  renderHints: {
    defaultCollapsed: true;
    supportsGoalDisclosure: true;
    refreshOn: Array<"plan.write" | "plan.edit" | "plan.done">;
  };
};

export type PlanReviewInput = {
  planContent: PlanDocument;
  isSubPlan: boolean;
  workflowDefinitions?: string;
  projectId?: string;
  taskName?: string;
};

export type PlanReviewer = (input: PlanReviewInput) => Promise<PlanReviewResult | null> | PlanReviewResult | null;

export type TruthDepositionCandidate = {
  projectId: string;
  taskName: string;
  planPath: string;
  planTitle: string;
  goalText: string;
  planStatus: PlanStatus;
  summary?: string;
  rules?: string[];
  references?: PlanReference[];
  retrospective?: PlanRetrospective;
  keyDecisions?: string[];
  suggestedTruthPaths: string[];
};

export type AdrDepositionCandidate = {
  projectId: string;
  taskName: string;
  planPath: string;
  planTitle: string;
  planStatus: PlanStatus;
  keyDecisions: string[];
  shouldWriteAdr: boolean;
  reason: string;
};

export type SubplanClosureCandidate = {
  taskName: string;
  parentPlan: string;
  parentTaskId: number;
};

export type PlanCompletionHooks = {
  truthCandidate: TruthDepositionCandidate;
  adrCandidate: AdrDepositionCandidate;
  subplanClosureCandidate?: SubplanClosureCandidate;
};

export type TaskSourceSnapshot = {
  projectId: string;
  task: string;
  status?: TaskStatus;
  updatedAt?: string;
  activePlan?: string;
  planStatus?: string;
  planPath?: string;
};

export type LeaveState = {
  leftAt: string;
  updatedAt?: string;
  reason:
    | "split_to_new_task"
    | "user_switch"
    | "manual_leave"
    | "switch_to_new_plan"
    | "completed"
    | "paused"
    | "abandoned";
  fromTask?: string;
  toTask?: string;
  continueNeeded?: boolean;
  nextTask?: string;
  handoff?: string;
  sourceSnapshot?: TaskSourceSnapshot;
};

export type PreviousTaskRef = {
  projectId: string;
  task: string;
  linkedAt: string;
  reason: LeaveState["reason"];
  leaveStateAt?: string;
};

export type InheritedFrom = {
  projectId?: string;
  task: string;
  mode: "history_tail" | "prev_task" | "split_from_plan";
  linkedAt?: string;
  historyLimit: number;
  sourceSnapshot?: TaskSourceSnapshot;
  reason?: LeaveState["reason"];
  sourceStatus: string;
  sourceUpdatedAt: string;
  sourceLeaveStateUpdatedAt: string;
  sourceLeaveState: LeaveState;
};

export type TaskMeta = {
  name: string;
  description: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  subagents: unknown[];
  status?: TaskStatus;
  taskType?: string;
  activePlan?: string;
  rules?: string[];
  prevTask?: string;
  leaveState?: LeaveState;
  inheritedFrom?: InheritedFrom;
  previousTask?: PreviousTaskRef;
  [key: string]: unknown;
};

export type ProjectContext = {
  projectRoot: string;
  clawDir: string;
  projectJsonPath: string;
  truthDir: string;
  tasksDir: string;
  projectId: string;
  projectName?: string;
  projectConfig: ProjectConfig | null;
};

export type TaskContext = {
  project: ProjectContext;
  taskName: string;
  taskDir: string;
  metaPath: string;
  meta: TaskMeta;
  activePlan: string;
  activePlanPath: string;
};

export type ResolvedContext = {
  project: ProjectContext;
  task?: TaskContext;
};

export type PlanWriteInput = {
  cwd: string;
  taskName?: string;
  filePath?: string;
  title?: string;
  description?: string;
  goalText?: string;
  planStatus?: string;
  content?: PlanDocument;
  parentTaskId?: number;
  reviewer?: PlanReviewer;
  workflowDefinitions?: string;
};

export type PlanWriteResult = {
  taskName: string;
  taskDir: string;
  metaPath: string;
  planPath: string;
  planFile: string;
  planStatus: PlanStatus;
  createdTask: boolean;
  createdPlan: boolean;
  eventType: "plan_created" | "plan_changed";
  parentPlan?: string;
  parentTaskId?: number;
  planReview?: PlanReviewResult;
  nextAction?: "collect_requirements" | "revise_plan_from_review" | "proceed";
  instruction?: string;
  workflowGuidance: WorkflowGuidance;
  planView: PlanViewModel;
};

export type PlanEditInput = {
  cwd: string;
  taskName: string;
  planFile?: string;
  changeSummary?: string;
  patch?: Partial<PlanDocument>;
  planStatus?: string;
  taskId?: number;
  taskStatus?: PlanTaskStatus;
  appendTasks?: PlanTask[];
  reviewer?: PlanReviewer;
  workflowDefinitions?: string;
};

export type PlanEditResult = {
  taskName: string;
  planPath: string;
  planFile: string;
  planStatus: PlanStatus;
  previousPlanStatus: PlanStatus;
  emittedEvents: string[];
  changedTaskIds: number[];
  planReview?: PlanReviewResult;
  nextAction?: "collect_requirements" | "revise_plan_from_review" | "proceed";
  instruction?: string;
  completionHooks?: PlanCompletionHooks;
  workflowGuidance: WorkflowGuidance;
  planView: PlanViewModel;
};

export type PlanShowInput = {
  cwd: string;
  taskName: string;
  planFile?: string;
};

export type PlanShowResult = {
  taskName: string;
  planPath: string;
  planFile: string;
  plan: PlanDocument;
  planView: PlanViewModel;
};

export type SwitchTaskInput = {
  cwd: string;
  fromTask: string;
  toTask: string;
  reason?: LeaveState["reason"];
  mode?: InheritedFrom["mode"];
  historyLimit?: number;
};

export type SwitchTaskResult = {
  fromTask: string;
  toTask: string;
  sourceMetaPath: string;
  targetMetaPath: string;
  leaveState: LeaveState;
};

export type MemoryScope = "project" | "task";

export type MemoryIndexInput = {
  cwd: string;
  scope?: MemoryScope;
  taskName?: string;
};

export type MemorySearchInput = {
  cwd: string;
  query: string;
  scope?: MemoryScope;
  taskName?: string;
  limit?: number;
};

export type MemorySourceEntry = {
  sourcePath: string;
  kind: string;
  content: string;
};

export type MemorySearchResultEntry = {
  sourcePath: string;
  kind: string;
  snippet: string;
  score: number;
};

export type MemoryIndexResult = {
  scope: MemoryScope;
  storePath: string;
  indexedCount: number;
  sources: string[];
};

export type MemorySearchResult = {
  scope: MemoryScope;
  storePath: string;
  results: MemorySearchResultEntry[];
};

export type MemoryGetInput = {
  cwd: string;
  scope?: MemoryScope;
  taskName?: string;
};

export type MemoryGetResult = {
  scope: MemoryScope;
  storePath: string;
  sources: MemorySourceEntry[];
};

export type TruthIngestInput = {
  cwd: string;
  target: string;
  content: string;
  append?: boolean;
};

export type TruthIngestResult = {
  truthRoot: string;
  targetPath: string;
  bytesWritten: number;
  mode: "append" | "replace";
};

export type ProjectProtocolIssue = {
  path: string;
  message: string;
};

export type ProjectProtocolCheckResult = {
  ok: boolean;
  projectRoot: string;
  projectJsonPath: string;
  issues: ProjectProtocolIssue[];
};

export type ProjectProtocolEnsureResult = {
  ok: boolean;
  changed: boolean;
  projectRoot: string;
  projectJsonPath: string;
  issueCountBefore: number;
  issueCountAfter: number;
  fixedPaths: string[];
  issuesBefore: ProjectProtocolIssue[];
  issuesAfter: ProjectProtocolIssue[];
  projectConfig: ProjectConfig;
};

export type ArchivedTaskRecord = {
  taskName: string;
  sourceTaskDir: string;
  archivedTaskDir: string;
  archivedPlanPath?: string;
  updatedAt?: string;
};

export type TaskRetentionResult = {
  enabled: boolean;
  autoAchieveTask: boolean;
  maxTasksToKeep: number;
  archivedCurrentTask?: ArchivedTaskRecord;
  prunedArchivedTasks: ArchivedTaskRecord[];
};
