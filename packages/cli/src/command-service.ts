import { createHash } from "node:crypto";
import path from "node:path";
import {
  ClawError,
  activatePlan,
  buildKnowledgeDelegateDispatch,
  completeSubplanAndRestoreParent,
  createPlanAndSwitchFocus,
  createPlanRef,
  createSubplan,
  createSubplanAndSwitchFocus,
  editPlan,
  buildPlanWorkflowGuidance,
  leaveCurrentPlan,
  releaseCurrentPlanFocus,
  readFocusedPlan,
  resolvePlanEffectiveConfig,
  resolveProjectContext,
  searchMemoryAsync,
  showPlan,
  tryEndKnowledgePlan,
  type PlanDocument,
  type PlanEditInput,
  type PlanFieldUpdates,
  type PlanMutationOperation,
  type PlanRef,
  type PlanWriteInput,
  type SubplanWriteInput,
  type WorkflowGuidance,
  type KnowledgeDelegateDispatch,
  writePlan,
} from "@veewo/claw-core";
import { buildCodexHostActions } from "./codex-host-actions.js";
import { RegistryFocusSessionStore, SessionRegistryV2 } from "./session-registry-v2.js";

export type CommandContext = {
  cwd: string;
  agentSessionId?: string;
  sessionKey?: string;
  currentPlan?: PlanRef;
  host?: string;
  mode: "stateless" | "session";
};

export type ClawCommandRequest =
  | {
      operation: "plan.create";
      input: Omit<PlanWriteInput, "cwd" | "ownerSessionKey">;
    }
  | { operation: "plan.resume"; input: { planId?: string } }
  | { operation: "plan.leave"; input: Record<string, never> }
  | { operation: "plan.show"; input: { simple?: boolean } }
  | { operation: "plan.edit"; input: { operations: PlanMutationOperation[] } }
  | { operation: "plan.wait"; input: Record<string, never> }
  | { operation: "plan.done"; input: PlanFieldUpdates & { retrospectiveSummary: string } }
  | {
      operation: "subplan.create";
      input: Omit<SubplanWriteInput, "cwd" | "ownerSessionKey">;
    }
  | {
      operation: "task.edit";
      input: Omit<PlanEditInput, "cwd" | "taskName" | "planFile" | "ownerSessionKey">;
    }
  | {
      operation: "task.add";
      input: { tasks: Array<{ title: string; detail?: string }> };
    }
  | {
      operation: "task.done";
      input: { tasks: Array<{ id: number; choiceId?: string }> };
    }
  | { operation: "search"; input: { query: string; limit?: number; dir?: string } }
  | { operation: string; input: unknown };

export type ClawCommandResult = {
  output: unknown;
  hostActions?: unknown[];
  postCommitEffects?: unknown[];
  knowledgeDispatch?: KnowledgeDelegateDispatch;
};

export class ClawCommandService {
  readonly registry: SessionRegistryV2;
  readonly focusStore: RegistryFocusSessionStore;

  constructor(registry: SessionRegistryV2) {
    this.registry = registry;
    this.focusStore = new RegistryFocusSessionStore(registry);
  }

  async execute(
    context: CommandContext,
    request: ClawCommandRequest,
  ): Promise<ClawCommandResult> {
    const cwd = path.resolve(context.cwd);
    switch (request.operation) {
      case "plan.show": {
        const commandInput = request.input as { simple?: boolean };
        const current = this.requireCurrentPlan(context);
        const shown = showPlan({
          cwd,
          taskName: current.taskName,
          planFile: current.planFile,
        });
        return { output: commandInput.simple ? shown.simplePlanView : shown };
      }
      case "plan.leave": {
        const sessionKey = this.requireSessionKey(context);
        const project = resolveProjectContext(cwd);
        const result = await leaveCurrentPlan({
          project,
          sessionKey,
          sessionStore: this.focusStore,
        });
        const knowledgeDispatch = this.finalizeEnteredEnds(context, result.enteredEndPlans);
        const ended = result.enteredEndPlans.at(-1);
        const hostActions = ended
          ? await this.codexActionsForPlan(context, {
              command: "plan.leave",
              taskName: ended.ref.taskName,
              planFile: ended.ref.planFile,
              plan: ended.plan,
              actionIdPrefix: result.transitionId,
            })
          : undefined;
        return {
          output: result,
          ...(hostActions?.length ? { hostActions } : {}),
          ...(result.enteredEndPlans.length
            ? { postCommitEffects: this.endPostCommitEffects(result.enteredEndPlans) }
            : {}),
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
      }
      case "plan.edit": {
        const commandInput = request.input as { operations: PlanMutationOperation[] };
        if (commandInput.operations.length === 0) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "plan.edit requires at least one operation.");
        }
        return this.editCurrentPlan(context, commandInput.operations, "plan.edit");
      }
      case "plan.wait":
        return this.editCurrentPlan(
          context,
          [{ type: "plan.status", status: "process.wait" }],
          "plan.edit",
        );
      case "plan.done": {
        const commandInput = request.input as PlanFieldUpdates & { retrospectiveSummary: string };
        if (!commandInput.retrospectiveSummary?.trim()) {
          throw new ClawError("RETROSPECTIVE_REQUIRED", "plan.done requires retrospectiveSummary.");
        }
        return this.editCurrentPlan(context, [
          { type: "plan.update", updates: commandInput },
          { type: "plan.status", status: "end.completed" },
        ], "plan.done");
      }
      case "plan.resume": {
        const commandInput = request.input as { planId?: string };
        const sessionKey = this.requireSessionKey(context);
        const project = resolveProjectContext(cwd);
        const target = commandInput.planId
          ? parsePlanId(project, commandInput.planId)
          : undefined;
        const result = await activatePlan({
          project,
          sessionKey,
          target,
          sessionStore: this.focusStore,
        });
        const knowledgeDispatch = this.finalizeEnteredEnds(context, result.enteredEndPlans, result.currentPlan);
        const shown = result.currentPlan
          ? showPlan({ cwd, taskName: result.currentPlan.taskName, planFile: result.currentPlan.planFile })
          : undefined;
        const hostActions = shown
          ? await this.codexActionsForPlan(context, {
              command: "plan.resume",
              taskName: shown.taskName,
              planFile: shown.planFile,
              plan: shown.plan,
              actionIdPrefix: result.transitionId,
              recoveryResync: true,
              forceProjectionSync: true,
            })
          : undefined;
        return {
          output: result,
          ...(hostActions?.length ? { hostActions } : {}),
          ...(result.enteredEndPlans.length
            ? { postCommitEffects: this.endPostCommitEffects(result.enteredEndPlans) }
            : {}),
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
      }
      case "plan.create": {
        const commandInput = request.input as Omit<PlanWriteInput, "cwd" | "ownerSessionKey">;
        const sessionKey = this.requireSessionKey(context);
        const created = await writePlan({
          ...commandInput,
          cwd,
          ownerSessionKey: undefined,
          host: commandInput.host ?? context.host,
        });
        const project = resolveProjectContext(cwd);
        const createdRef = createPlanRef(project, created.taskName, created.planFile);
        const focus = await createPlanAndSwitchFocus({
          project,
          sessionKey,
          createdPlan: createdRef,
          sessionStore: this.focusStore,
        });
        const knowledgeDispatch = this.finalizeEnteredEnds(context, focus.enteredEndPlans, createdRef);
        const output = { ...created, focusTransition: focus };
        const hostActions = this.codexActionsFromMutation(context, "plan.create", output);
        return {
          output,
          ...(hostActions.length ? { hostActions } : {}),
          ...(focus.enteredEndPlans.length
            ? { postCommitEffects: this.endPostCommitEffects(focus.enteredEndPlans) }
            : {}),
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
      }
      case "subplan.create": {
        const commandInput = request.input as Omit<SubplanWriteInput, "cwd" | "ownerSessionKey">;
        const sessionKey = this.requireSessionKey(context);
        const created = await createSubplan({
          ...commandInput,
          cwd,
          ownerSessionKey: undefined,
          host: commandInput.host ?? context.host,
          deferParentMutation: true,
        });
        const project = resolveProjectContext(cwd);
        const parentRef = createPlanRef(project, created.taskName, created.parentPlan ?? "plan.json");
        const childRef = createPlanRef(project, created.taskName, created.planFile);
        const parentAfterLink = structuredClone(showPlan({
          cwd,
          taskName: created.taskName,
          planFile: parentRef.planFile,
        }).plan);
        const parentTask = parentAfterLink.tasks.find((task) => task.id === created.parentTaskId);
        if (!parentTask) {
          throw new ClawError(
            "PLAN_TRANSITION_CONFLICT",
            `Parent task ${String(created.parentTaskId)} disappeared before subplan focus commit.`,
          );
        }
        parentTask.execution = {
          ...parentTask.execution,
          type: "subplan",
          subplan: created.planFile,
          planPath: created.planFile,
        };
        if (parentTask.status === "pending") parentTask.status = "in_progress";
        parentAfterLink.updatedAt = new Date().toISOString();
        const focus = await createSubplanAndSwitchFocus({
          project,
          sessionKey,
          parentPlan: parentRef,
          parentAfterLink,
          childPlan: childRef,
          sessionStore: this.focusStore,
        });
        const knowledgeDispatch = this.finalizeEnteredEnds(context, focus.enteredEndPlans, childRef);
        const output = { ...created, focusTransition: focus };
        const hostActions = this.codexActionsFromMutation(context, "subplan.create", output);
        return {
          output,
          ...(hostActions.length ? { hostActions } : {}),
          ...(focus.enteredEndPlans.length
            ? { postCommitEffects: this.endPostCommitEffects(focus.enteredEndPlans) }
            : {}),
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
      }
      case "task.edit": {
        const commandInput = request.input as Omit<
          PlanEditInput,
          "cwd" | "taskName" | "planFile" | "ownerSessionKey"
        >;
        const current = this.requireCurrentPlan(context);
        const result = await editPlan({
          ...commandInput,
          cwd,
          taskName: current.taskName,
          planFile: current.planFile,
          ownerSessionKey: undefined,
          host: commandInput.host ?? context.host,
        });
        const hostActions = this.codexActionsFromMutation(context, "task.edit", result);
        return { output: result, ...(hostActions.length ? { hostActions } : {}) };
      }
      case "task.add": {
        const commandInput = request.input as { tasks: Array<{ title: string; detail?: string }> };
        if (!commandInput.tasks?.length) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "task.add requires at least one task.");
        }
        return this.editCurrentPlan(
          context,
          commandInput.tasks.map((task) => ({ type: "task.add", ...task })),
          "plan.edit",
        );
      }
      case "task.done": {
        const commandInput = request.input as { tasks: Array<{ id: number; choiceId?: string }> };
        if (!commandInput.tasks?.length) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "task.done requires at least one task id.");
        }
        return this.editCurrentPlan(
          context,
          commandInput.tasks.map((task) => ({
            type: "task.edit",
            id: task.id,
            status: "done",
            ...(task.choiceId ? { choiceId: task.choiceId } : {}),
          })),
          "plan.edit",
        );
      }
      case "search": {
        const commandInput = request.input as { query: string; limit?: number; dir?: string };
        const searchCwd = commandInput.dir
          ? path.resolve(cwd, commandInput.dir)
          : cwd;
        return {
          output: await searchMemoryAsync({
            cwd: searchCwd,
            query: commandInput.query,
            limit: commandInput.limit,
            scope: "project",
          }),
        };
      }
      default:
        throw new ClawError(
          "SESSION_OPERATION_UNSUPPORTED",
          `Session command operation "${request.operation}" is not supported.`,
          { operation: request.operation },
        );
    }
  }

  private requireSessionKey(context: CommandContext): string {
    if (context.mode !== "session" || !context.sessionKey?.trim()) {
      throw new ClawError("CURRENT_PLAN_REQUIRED", "This operation requires an open session.");
    }
    return context.sessionKey;
  }

  private async editCurrentPlan(
    context: CommandContext,
    operations: PlanMutationOperation[],
    commandSource: "plan.edit" | "plan.done",
  ): Promise<ClawCommandResult> {
    const current = this.requireCurrentPlan(context);
    const sessionKey = this.requireSessionKey(context);
    const project = resolveProjectContext(context.cwd);
    const result = await editPlan({
      cwd: context.cwd,
      taskName: current.taskName,
      planFile: current.planFile,
      operations,
      commandSource,
      ownerSessionKey: undefined,
      host: context.host,
      deferSubplanClosure: true,
    });
    if (!result.previousPlanStatus.startsWith("end.") && result.planStatus.startsWith("end.")) {
      if (
        result.completionHooks?.subplanClosureCandidate
        && result.plan.parentPlan
        && result.plan.parentTaskId !== undefined
      ) {
        const parentRef = createPlanRef(project, current.taskName, result.plan.parentPlan);
        await completeSubplanAndRestoreParent({
          project,
          sessionKey,
          childPlan: current,
          completedChild: result.plan,
          parentPlan: parentRef,
          parentTaskId: result.plan.parentTaskId,
          sessionStore: this.focusStore,
        });
      } else {
        await releaseCurrentPlanFocus({
          project,
          sessionKey,
          expectedEnd: true,
          sessionStore: this.focusStore,
        });
      }
      const knowledgeDispatch = this.finalizeEnteredEnds(context, [{
        ref: current,
        plan: result.plan,
        endedAt: result.plan.completedAt ?? new Date().toISOString(),
      }]);
      const hostActions = this.codexActionsFromMutation(context, commandSource, result);
      return {
        output: result,
        ...(hostActions.length ? { hostActions } : {}),
        postCommitEffects: [{
          type: "completion.refresh",
          taskName: result.taskName,
          planStatus: result.planStatus,
        }],
        ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
      };
    }
    const hostActions = this.codexActionsFromMutation(context, commandSource, result);
    return { output: result, ...(hostActions.length ? { hostActions } : {}) };
  }

  private requireCurrentPlan(context: CommandContext): PlanRef {
    if (context.mode === "session") {
      const sessionKey = this.requireSessionKey(context);
      const project = resolveProjectContext(context.cwd);
      const current = readFocusedPlan(project, sessionKey, this.focusStore);
      if (current) return current;
    } else if (context.currentPlan) {
      return context.currentPlan;
    }
    throw new ClawError(
      "CURRENT_PLAN_REQUIRED",
      "The command requires a current plan. Resume or create a plan first.",
    );
  }

  private finalizeEnteredEnds(
    context: CommandContext,
    entered: Array<{ ref: PlanRef; plan: import("@veewo/claw-core").PlanDocument; endedAt: string }>,
    resumed?: PlanRef,
  ): KnowledgeDelegateDispatch | undefined {
    if (!context.agentSessionId || entered.length === 0) return undefined;
    const project = resolveProjectContext(context.cwd);
    const resumedPath = resumed
      ? showPlan({ cwd: context.cwd, taskName: resumed.taskName, planFile: resumed.planFile }).planPath
      : undefined;
    let dispatch: KnowledgeDelegateDispatch | undefined;
    for (const ended of entered) {
      const shown = showPlan({
        cwd: context.cwd,
        taskName: ended.ref.taskName,
        planFile: ended.ref.planFile,
      });
      const effectiveConfig = resolvePlanEffectiveConfig(project.projectConfig, ended.plan);
      const writer = effectiveConfig?.knowledgeWriter;
      const knowledgeEnd = tryEndKnowledgePlan({
        project,
        sessionId: context.agentSessionId,
        endedPlanPath: shown.planPath,
        ...(resumedPath ? { resumedPlanPath: resumedPath } : {}),
        endedAt: ended.endedAt,
        ...(writer ? { writer } : {}),
      });
      if (knowledgeEnd.finalizeId && writer?.executionPolicy === "subagent") {
        dispatch = buildKnowledgeDelegateDispatch({
          policy: "subagent",
          finalizeId: knowledgeEnd.finalizeId,
          writer,
        });
      }
    }
    return dispatch;
  }

  private endPostCommitEffects(
    entered: Array<{ ref: PlanRef; plan: import("@veewo/claw-core").PlanDocument; endedAt: string }>,
  ): unknown[] | undefined {
    const actions = entered.map((ended) => ({
      type: "completion.refresh",
      taskName: ended.ref.taskName,
      planFile: ended.ref.planFile,
      planStatus: ended.plan.status,
      endedAt: ended.endedAt,
    }));
    return actions.length ? actions : undefined;
  }

  private codexActionsFromMutation(
    context: CommandContext,
    command: string,
    result: {
      planPath: string;
      planStatus: string;
      previousPlan?: PlanDocument;
      plan: PlanDocument;
      workflowGuidance: WorkflowGuidance;
      events?: Array<{ mutationId?: string }>;
      focusTransition?: { transitionId?: string };
    },
  ): unknown[] {
    if (context.host !== "codex") return [];
    const actionIdPrefix = result.events?.at(-1)?.mutationId
      ?? result.focusTransition?.transitionId
      ?? createHash("sha256")
        .update(`${command}:${result.planPath}:${result.plan.updatedAt}`)
        .digest("hex")
        .slice(0, 24);
    return buildCodexHostActions({
      planStatus: result.planStatus,
      previousPlan: result.previousPlan,
      plan: result.plan,
      workflowGuidance: result.workflowGuidance,
    }, { actionIdPrefix });
  }

  private async codexActionsForPlan(
    context: CommandContext,
    input: {
      command: string;
      taskName: string;
      planFile: string;
      plan: PlanDocument;
      actionIdPrefix?: string;
      recoveryResync?: boolean;
      forceProjectionSync?: boolean;
    },
  ): Promise<unknown[]> {
    if (context.host !== "codex") return [];
    const project = resolveProjectContext(context.cwd);
    const workflowGuidance = await buildPlanWorkflowGuidance({
      taskName: input.taskName,
      planFile: input.planFile,
      plan: input.plan,
      projectRoot: project.projectRoot,
      projectConfig: resolvePlanEffectiveConfig(project.projectConfig, input.plan),
      host: context.host,
      recoveryResync: input.recoveryResync,
    });
    const actionIdPrefix = input.actionIdPrefix
      ?? createHash("sha256")
        .update(`${input.command}:${input.taskName}:${input.planFile}:${input.plan.updatedAt}`)
        .digest("hex")
        .slice(0, 24);
    return buildCodexHostActions({
      planStatus: input.plan.status,
      plan: input.plan,
      workflowGuidance,
    }, { actionIdPrefix, forceProjectionSync: input.forceProjectionSync });
  }
}

function parsePlanId(
  project: ReturnType<typeof resolveProjectContext>,
  planId: string,
): PlanRef {
  const normalized = planId.trim().replace(/\\/g, "/");
  if (!normalized) {
    throw new ClawError("PLAN_NOT_FOUND", "planId must be non-empty.");
  }
  const separator = normalized.lastIndexOf("/");
  return separator < 0
    ? createPlanRef(project, normalized)
    : createPlanRef(project, normalized.slice(0, separator), normalized.slice(separator + 1));
}
