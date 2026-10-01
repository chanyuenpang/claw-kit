import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ClawError,
  buildMemoryIndex,
  activatePlan,
  appendSubplanReturnGuidance,
  assertRootPlanCreateAllowed,
  buildKnowledgeAtomicDispatch,
  buildDshKnowledgeDispatch,
  buildKnowledgeDelegateDispatch,
  KNOWLEDGE_DISPATCH_LEAD_INSTRUCTION,
  completeSubplanAndRestoreParent,
  bindSessionToPlan,
  createPlanAndSwitchFocus,
  createPlanRef,
  createSubplan,
  createSubplanAndSwitchFocus,
  editPlan,
  buildPlanWorkflowGuidance,
  leaveCurrentPlan,
  releaseCurrentPlanFocus,
  readFocusedPlan,
  focusSessionKeyHash,
  resolveSessionWorkflowContext,
  resolvePlanEffectiveConfig,
  resolveKnowledgeWriterForHost,
  resolveSessionBoundPlan,
  resolveWorkflowProjectContext,
  searchMemoryAsync,
  showPlan,
  switchCurrentPlan,
  tryEndKnowledgePlan,
  tryLeaveKnowledgePlan,
  unbindSession,
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
  resolveThreadGoalPlan,
  resolveHostIntegrationProfile,
  isIntegrationHost,
} from "@veewo/claw-core";
import type {
  ClawHostActionV1,
  ClawKnowledgeDispatchV1,
  ClawPostCommitEffectV1,
} from "@veewo/claw-client";
import { buildCodexHostActions } from "./codex-host-actions.js";
import { isHostActionsHost, type ClawHost } from "./invocation-host.js";
import { RegistryFocusSessionStore, SessionRegistryV2 } from "./session-registry-v2.js";
import { claimKnowledgeCommand, knowledgeClaimReceiptCommand, doneKnowledgeCommand, findProjectKnowledgeJob } from "./knowledge-command.js";

export type CommandContext = {
  cwd: string;
  agentSessionId?: string;
  sessionKey?: string;
  currentPlan?: PlanRef;
  host?: string;
  mode: "stateless" | "session";
};

export type ClawCommandRequest = import("@veewo/claw-client").ClawSessionCommand;

export type ClawCommandResult = {
  output: unknown;
  hostActions?: ClawHostActionV1[];
  postCommitEffects?: ClawPostCommitEffectV1[];
  knowledgeDispatch?: ClawKnowledgeDispatchV1;
};

import { recoverCompletionRefreshBestEffort } from "./completion-refresh-recovery.js";

export class ClawCommandService {
  readonly registry: SessionRegistryV2;
  readonly focusStore: RegistryFocusSessionStore;

  constructor(registry: SessionRegistryV2) {
    this.registry = registry;
    this.focusStore = new RegistryFocusSessionStore(registry);
  }

  /** Repair the narrow crash window before a focus journal is prepared. */
  async reconcileCanonicalFocus(context: CommandContext): Promise<void> {
    if (!context.agentSessionId || !context.sessionKey) return;
    const project = this.resolveRecoveryProject(context);
    const retained = readFocusedPlan(project, context.sessionKey, this.focusStore);
    const boundPath = resolveSessionBoundPlan(project, context.agentSessionId);
    if (boundPath) {
      const boundRef = planRefFromAbsolutePath(project, boundPath);
      const bound = showPlan({
        cwd: context.cwd,
        scope: boundRef.scope,
        taskName: boundRef.taskName,
        planFile: boundRef.planFile,
        ownerSessionKey: context.agentSessionId,
      });
      if (bound.plan.status.startsWith("end.")) {
        unbindSession(project, context.agentSessionId);
        if (!retained) return;
        const retainedPlan = showPlan({
          cwd: context.cwd,
          scope: retained.scope,
          taskName: retained.taskName,
          planFile: retained.planFile,
          ownerSessionKey: context.agentSessionId,
        });
        if (!retainedPlan.plan.status.startsWith("end.")) {
          bindSessionToPlan(project, context.agentSessionId, retainedPlan.planPath);
          return;
        }
        await this.restoreOrReleaseEndedFocus(context, retained, retainedPlan.plan);
        return;
      }
      if (retained && retained.taskName === boundRef.taskName && retained.planFile === boundRef.planFile) return;
      if (bound.plan.parentPlan && bound.plan.parentTaskId !== undefined) {
        const parentRef = createPlanRef(project, bound.taskName, bound.plan.parentPlan);
        const parentAfterLink = structuredClone(showPlan({
          cwd: context.cwd,
          scope: parentRef.scope,
          taskName: parentRef.taskName,
          planFile: parentRef.planFile,
          ownerSessionKey: context.agentSessionId,
        }).plan);
        const parentTask = parentAfterLink.tasks.find((task) => task.id === bound.plan.parentTaskId);
        if (!parentTask) {
          throw new ClawError("PLAN_TRANSITION_CONFLICT", `Parent task ${bound.plan.parentTaskId} is unavailable during focus recovery.`);
        }
        parentTask.execution = {
          ...parentTask.execution,
          type: "subplan",
          subplan: bound.planFile,
          planPath: bound.planFile,
        };
        if (parentTask.status === "pending") parentTask.status = "in_progress";
        parentAfterLink.updatedAt = new Date().toISOString();
        await createSubplanAndSwitchFocus({
          project,
          sessionKey: context.sessionKey,
          parentPlan: parentRef,
          parentAfterLink,
          childPlan: boundRef,
          sessionStore: this.focusStore,
        });
        return;
      }
      await switchCurrentPlan({
        project,
        sessionKey: context.sessionKey,
        target: boundRef,
        kind: "resume",
        preserveTargetStatus: true,
        preserveCurrentEndState: true,
        sessionStore: this.focusStore,
      });
      return;
    }
    if (!retained) return;
    const retainedPlan = showPlan({
      cwd: context.cwd,
      scope: retained.scope,
      taskName: retained.taskName,
      planFile: retained.planFile,
      ownerSessionKey: context.agentSessionId,
    });
    if (!retainedPlan.plan.status.startsWith("end.")) {
      bindSessionToPlan(project, context.agentSessionId, retainedPlan.planPath);
      return;
    }
    await this.restoreOrReleaseEndedFocus(context, retained, retainedPlan.plan);
  }

  async execute(
    context: CommandContext,
    request: ClawCommandRequest,
  ): Promise<ClawCommandResult> {
    // Receipt reconciliation must not run unrelated canonical recovery effects.
    if (request.operation === "knowledge.claim.receipt") return this.executeCommand(context, request);
    recoverCompletionRefreshBestEffort(context.cwd, context.agentSessionId);
    try { return await this.executeCommand(context, request); }
    finally { recoverCompletionRefreshBestEffort(context.cwd, context.agentSessionId); }
  }

  private async executeCommand(context: CommandContext, request: ClawCommandRequest): Promise<ClawCommandResult> {
    const cwd = path.resolve(context.cwd);
    switch (request.operation) {
      case "plan.show": {
        const commandInput = request.input as { simple?: boolean };
        const current = this.requireCurrentPlan(context);
        const shown = showPlan({
          cwd,
          scope: current.scope,
          taskName: current.taskName,
          planFile: current.planFile,
          ownerSessionKey: this.ownerSessionKey(context),
        });
        return { output: commandInput.simple ? shown.simplePlanView : shown };
      }
      case "plan.start": {
        const commandInput = request.input as {
          updates?: PlanFieldUpdates;
          appendTasks?: Array<{ title: string; detail?: string }>;
        };
        const hasUpdates = Boolean(commandInput.updates && Object.keys(commandInput.updates).length > 0);
        if (!hasUpdates && !commandInput.appendTasks?.length) {
          throw new ClawError(
            "PROJECT_CONFIG_INVALID",
            "plan.start requires plan fields or at least one task.",
          );
        }
        const current = this.requireCurrentPlan(context);
        const result = await editPlan({
          cwd,
          scope: current.scope,
          taskName: current.taskName,
          planFile: current.planFile,
          updates: hasUpdates ? commandInput.updates : undefined,
          appendTasks: commandInput.appendTasks?.map((task) => ({
            ...task,
            status: "pending",
          })) as PlanEditInput["appendTasks"],
          applyPlanStartGuidance: true,
          commandSource: "plan.start",
          ownerSessionKey: this.ownerSessionKey(context),
          host: context.host,
        });
        const hostActions = this.codexActionsFromMutation(context, "plan.start", result);
        return { output: result, ...(hostActions.length ? { hostActions } : {}) };
      }
      case "plan.leave": {
        const sessionKey = this.requireSessionKey(context);
        const project = this.resolveProject(context, this.currentPlanScope(context));
        const result = await leaveCurrentPlan({
          project,
          sessionKey,
          sessionStore: this.focusStore,
        });
        unbindSession(project, this.ownerSessionKey(context));
        const knowledgeDispatch = this.finalizeEnteredEnds(context, result.enteredEndPlans);
        const ended = result.enteredEndPlans.at(-1);
        const hostActions = ended
          ? await this.codexActionsForPlan(context, {
              command: "plan.leave",
              scope: ended.ref.scope,
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
        const commandInput = request.input as { operations: PlanMutationOperation[]; expectedPlanPath?: string };
        if (commandInput.operations.length === 0) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "plan.edit requires at least one operation.");
        }
        if (commandInput.expectedPlanPath !== undefined) {
          const expected = commandInput.expectedPlanPath;
          if (typeof expected !== "string" || !expected.trim() || !path.isAbsolute(expected)) {
            throw new ClawError("PROJECT_CONFIG_INVALID", "expectedPlanPath must be an absolute plan path.");
          }
          // SessionCommandExecutor holds its per-session execution lock across
          // this precondition and editCurrentPlan: never resume or redirect here.
          let current: PlanRef;
          try { current = this.requireCurrentPlan(context); }
          catch (error) {
            if (!(error instanceof ClawError) || error.code !== "CURRENT_PLAN_REQUIRED") throw error;
            throw new ClawError("PLAN_FOCUS_CHANGED", "The expected parent plan is no longer focused.");
          }
          const shown = showPlan({ cwd, scope: current.scope, taskName: current.taskName,
            planFile: current.planFile, ownerSessionKey: this.ownerSessionKey(context) });
          const normalizedPath = (value: string): string => process.platform === "win32"
            ? path.resolve(value).toLowerCase() : path.resolve(value);
          if (normalizedPath(shown.planPath) !== normalizedPath(expected)) {
            throw new ClawError("PLAN_FOCUS_CHANGED", "The expected parent plan is no longer focused.", {
              expectedPlanPath: path.resolve(expected), currentPlanPath: shown.planPath,
            });
          }
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
        const commandInput = request.input as PlanFieldUpdates;
        if (this.resolveProject(context).scope !== "session" && !commandInput.retrospectiveSummary?.trim()) {
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
        const project = commandInput.planId
          ? this.resolveResumeProject(context, commandInput.planId)
          : this.resolveProject(context);
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
          ? showPlan({
              cwd,
              scope: result.currentPlan.scope,
              taskName: result.currentPlan.taskName,
              planFile: result.currentPlan.planFile,
              ownerSessionKey: this.ownerSessionKey(context),
            })
          : undefined;
        const hostActions = shown
          ? await this.codexActionsForPlan(context, {
              command: "plan.resume",
              scope: result.currentPlan?.scope,
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
        const currentProject = this.resolveProject(context);
        assertRootPlanCreateAllowed({
          project: currentProject,
          sessionKey,
          sessionStore: this.focusStore,
        });
        const created = await writePlan({
          ...commandInput,
          cwd,
          ownerSessionKey: context.agentSessionId,
          host: context.host,
        });
        const project = this.resolveProject(context, created.scope);
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
          scope: this.currentPlanScope(context),
          ownerSessionKey: this.ownerSessionKey(context),
          host: context.host,
          deferParentMutation: true,
        });
        const project = this.resolveProject(context, created.scope);
        const parentRef = createPlanRef(project, created.taskName, created.parentPlan ?? "plan.json");
        const childRef = createPlanRef(project, created.taskName, created.planFile);
        const parentAfterLink = structuredClone(showPlan({
          cwd,
          scope: created.scope,
          taskName: created.taskName,
          planFile: parentRef.planFile,
          ownerSessionKey: this.ownerSessionKey(context),
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
          scope: current.scope,
          taskName: current.taskName,
          planFile: current.planFile,
          commandSource: "task.edit",
          ownerSessionKey: this.ownerSessionKey(context),
          host: context.host,
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
          "task.add",
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
          "task.done",
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
      case "search.index.refresh":
        // The session daemon owns cwd; callers cannot target another project.
        return { output: buildMemoryIndex({ cwd, scope: "project" }) };
      case "knowledge.claim":
      case "knowledge.claim.receipt": {
        const { finalizeId } = request.input as { finalizeId: string };
        const project = this.resolveProject(context, "project");
        const jobPath = findProjectKnowledgeJob(project.projectRoot, finalizeId, true);
        const claimant = { projectRoot: project.projectRoot, host: context.host ?? "", agentSessionId: context.agentSessionId ?? "" };
        if (request.operation === "knowledge.claim.receipt") {
          return { output: knowledgeClaimReceiptCommand(jobPath, claimant) };
        }
        const version = (JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
        return { output: claimKnowledgeCommand(jobPath, version, claimant) };
      }
      case "knowledge.done": {
        const input = request.input as { finalizeId: string; claimToken: string; status: "succeeded" | "failed"; result?: string; error?: string };
        const project = this.resolveProject(context, "project");
        const jobPath = findProjectKnowledgeJob(project.projectRoot, input.finalizeId);
        if (input.status === "succeeded" && input.result === undefined) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "knowledge done --status succeeded requires --result.");
        }
        if (input.status === "failed" && !input.error) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "knowledge done --status failed requires --error.");
        }
        if (input.status !== "succeeded" && input.status !== "failed") {
          throw new ClawError("PROJECT_CONFIG_INVALID", "Unsupported knowledge done status " + String(input.status) + ".");
        }
        return { output: doneKnowledgeCommand({ jobPath, ...input }) };
      }
      default:
        throw new ClawError(
          "SESSION_OPERATION_UNSUPPORTED",
          "Operation is outside the model command contract.",
        );
    }
  }

  private requireSessionKey(context: CommandContext): string {
    if (context.mode !== "session" || !context.sessionKey?.trim()) {
      throw new ClawError("CURRENT_PLAN_REQUIRED", "This operation requires an open session.");
    }
    return context.sessionKey;
  }

  private resolveProject(context: CommandContext, requestedScope?: "project" | "session") {
    return resolveWorkflowProjectContext(
      context.cwd,
      context.mode === "session" ? context.agentSessionId : undefined,
      requestedScope ?? this.currentPlanScope(context),
    );
  }

  private ownerSessionKey(context: CommandContext): string | undefined {
    return context.mode === "session" ? context.agentSessionId : undefined;
  }

  private async restoreOrReleaseEndedFocus(
    context: CommandContext,
    current: PlanRef,
    completed: PlanDocument,
  ): Promise<void> {
    const project = this.resolveProject(context, current.scope);
    if (completed.parentPlan && completed.parentTaskId !== undefined) {
      const parentRef = createPlanRef(project, current.taskName, completed.parentPlan);
      await completeSubplanAndRestoreParent({
        project,
        sessionKey: this.requireSessionKey(context),
        childPlan: current,
        completedChild: completed,
        parentPlan: parentRef,
        parentTaskId: completed.parentTaskId,
        sessionStore: this.focusStore,
      });
      const parent = showPlan({
        cwd: context.cwd,
        scope: parentRef.scope,
        taskName: parentRef.taskName,
        planFile: parentRef.planFile,
        ownerSessionKey: context.agentSessionId,
      });
      bindSessionToPlan(project, context.agentSessionId, parent.planPath);
      return;
    }
    await releaseCurrentPlanFocus({
      project,
      sessionKey: this.requireSessionKey(context),
      expectedEnd: true,
      sessionStore: this.focusStore,
    });
  }

  private async editCurrentPlan(
    context: CommandContext,
    operations: PlanMutationOperation[],
    commandSource: "plan.edit" | "plan.done" | "task.add" | "task.done",
  ): Promise<ClawCommandResult> {
    const current = this.requireCurrentPlan(context);
    const sessionKey = this.requireSessionKey(context);
    const project = this.resolveProject(context, current.scope);
    const result = await editPlan({
      cwd: context.cwd,
      scope: current.scope,
      taskName: current.taskName,
      planFile: current.planFile,
      operations,
      commandSource,
      ownerSessionKey: this.ownerSessionKey(context),
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
        const focus = await completeSubplanAndRestoreParent({
          project,
          sessionKey,
          childPlan: current,
          completedChild: result.plan,
          parentPlan: parentRef,
          parentTaskId: result.plan.parentTaskId,
          sessionStore: this.focusStore,
        });
        const parent = showPlan({
          cwd: context.cwd,
          scope: parentRef.scope,
          taskName: parentRef.taskName,
          planFile: parentRef.planFile,
          ownerSessionKey: this.ownerSessionKey(context),
        });
        const parentGuidance = appendSubplanReturnGuidance({
          guidance: await buildPlanWorkflowGuidance({
            taskName: parent.taskName,
            planFile: parent.planFile,
            plan: parent.plan,
            commandSource,
            projectRoot: project.projectRoot,
            projectConfig: resolvePlanEffectiveConfig(project.projectConfig, parent.plan),
            previousStatus: "end.leave",
            completedTaskIds: [result.plan.parentTaskId],
            host: context.host,
          }),
          completedPlanFile: result.planFile,
          completedPlanTitle: result.plan.title,
          parentTaskId: result.plan.parentTaskId,
        });
        const resumedResult = {
          taskName: parent.taskName,
          planPath: parent.planPath,
          planFile: parent.planFile,
          planStatus: parent.plan.status,
          previousPlanStatus: "end.leave" as const,
          emittedEvents: result.emittedEvents,
          changedTaskIds: [result.plan.parentTaskId],
          appendedTaskIds: [],
          completedTaskIds: [result.plan.parentTaskId],
          workflowGuidance: parentGuidance,
          plan: parent.plan,
          planView: parent.planView,
          events: result.events,
          focusTransition: focus,
          completedSubplan: {
            taskName: result.taskName,
            planPath: result.planPath,
            planFile: result.planFile,
            planStatus: result.planStatus,
          },
        };
        const knowledgeDispatch = this.finalizeEnteredEnds(context, [{
          ref: current,
          plan: result.plan,
          endedAt: result.plan.completedAt ?? new Date().toISOString(),
        }]);
        const hostActions = this.codexActionsFromMutation(context, commandSource, resumedResult);
        return {
          output: resumedResult,
          ...(hostActions.length ? { hostActions } : {}),
          postCommitEffects: [{
            type: "completion.refresh",
            taskName: result.taskName,
            planStatus: result.planStatus,
          }],
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
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
      const project = this.resolveProject(context);
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

  /**
   * Storage scope of the session's focused plan, when one exists. Plan
   * operations must resolve their project context with this scope: a
   * project-scoped plan stays in the project tasks directory even when the
   * session also owns a session workflow manifest (which the ambient
   * undefined-scope resolution would prefer, making the plan unreachable).
   */
  private currentPlanScope(context: CommandContext): "project" | "session" | undefined {
    if (context.mode === "session") {
      const sessionKey = context.sessionKey?.trim();
      return sessionKey ? this.focusStore.read(focusSessionKeyHash(sessionKey)).currentPlan?.scope : undefined;
    }
    return context.currentPlan?.scope;
  }

  private availableProjects(context: CommandContext) {
    const projects: Array<ReturnType<typeof resolveWorkflowProjectContext>> = [];
    try { projects.push(this.resolveProject(context, "project")); }
    catch (error) {
      if (!(error instanceof ClawError) || error.code !== "PROJECT_ROOT_NOT_FOUND") throw error;
    }
    const session = resolveSessionWorkflowContext(this.ownerSessionKey(context));
    if (session) projects.push(session);
    return projects;
  }

  private resolveResumeProject(context: CommandContext, planId: string) {
    // A current focus supplies scope authority. Without it, never let a retained
    // session manifest silently choose between identically named plans.
    if (this.currentPlanScope(context)) return this.resolveProject(context);
    const matches = this.availableProjects(context).filter((project) => {
      const ref = parsePlanId(project, planId);
      try {
        showPlan({ cwd: context.cwd, scope: project.scope, taskName: ref.taskName,
          planFile: ref.planFile, ownerSessionKey: this.ownerSessionKey(context) });
        return true;
      } catch (error) {
        if (error instanceof ClawError && ["TASK_NOT_FOUND", "PLAN_NOT_FOUND"].includes(error.code)) return false;
        throw error;
      }
    });
    if (matches.length > 1) throw new ClawError("PLAN_TRANSITION_CONFLICT",
      "The plan id is ambiguous across project and session scopes.", { planId, scopes: matches.map((project) => project.scope) });
    return matches[0] ?? this.resolveProject(context);
  }

  private resolveRecoveryProject(context: CommandContext) {
    if (this.currentPlanScope(context)) return this.resolveProject(context);
    const bound = this.availableProjects(context).filter((project) => {
      const planPath = resolveSessionBoundPlan(project, context.agentSessionId);
      if (!planPath) return false;
      const ref = planRefFromAbsolutePath(project, planPath);
      const shown = showPlan({ cwd: context.cwd, scope: project.scope, taskName: ref.taskName,
        planFile: ref.planFile, ownerSessionKey: context.agentSessionId });
      return !shown.plan.status.startsWith("end.");
    });
    if (bound.length > 1) throw new ClawError("PLAN_TRANSITION_CONFLICT",
      "Session recovery is ambiguous: active bindings exist in both storage scopes.");
    return bound[0] ?? this.resolveProject(context);
  }

  private finalizeEnteredEnds(
    context: CommandContext,
    entered: Array<{ ref: PlanRef; plan: import("@veewo/claw-core").PlanDocument; endedAt: string }>,
    resumed?: PlanRef,
  ): KnowledgeDelegateDispatch | undefined {
    if (!context.agentSessionId || entered.length === 0) return undefined;
    const project = this.resolveProject(context, entered[0]?.ref.scope);
    if (project.scope !== "project") return undefined;
    const resumedPath = resumed
      ? showPlan({
          cwd: context.cwd,
          scope: resumed.scope,
          taskName: resumed.taskName,
          planFile: resumed.planFile,
          ownerSessionKey: this.ownerSessionKey(context),
        }).planPath
      : undefined;
    let dispatch: KnowledgeDelegateDispatch | undefined;
    for (const ended of entered) {
      const shown = showPlan({
        cwd: context.cwd,
        scope: ended.ref.scope,
        taskName: ended.ref.taskName,
        planFile: ended.ref.planFile,
        ownerSessionKey: this.ownerSessionKey(context),
      });
      if (ended.plan.status === "end.leave") {
        tryLeaveKnowledgePlan({ project, sessionId: context.agentSessionId, leftPlanPath: shown.planPath, knowledgeCapture: ended.plan.knowledgeCapture });
        continue;
      }
      const effectiveConfig = resolvePlanEffectiveConfig(project.projectConfig, ended.plan);
      const writer = resolveKnowledgeWriterForHost(effectiveConfig?.knowledgeWriter, context.host, project.projectConfig?.knowledgeWriterByHost);
      const knowledgeEnd = tryEndKnowledgePlan({
        project,
        sessionId: context.agentSessionId,
        endedPlanPath: shown.planPath,
        ...(resumedPath ? { resumedPlanPath: resumedPath } : {}),
        endedAt: ended.endedAt,
        knowledgeCapture: ended.plan.knowledgeCapture,
        ...(writer ? { writer } : {}),
        ...(isIntegrationHost(context.host)
          ? { host: context.host }
          : {}),
      });
      if (knowledgeEnd.finalizeId && knowledgeEnd.jobPath && writer?.executionPolicy === "subagent") {
        dispatch = context.host === "dsh"
          ? buildDshKnowledgeDispatch({ finalizeId: knowledgeEnd.finalizeId, writer })
          : resolveHostIntegrationProfile(context.host)?.usesAtomicKnowledgeDispatch === true
          ? buildKnowledgeAtomicDispatch({ finalizeId: knowledgeEnd.finalizeId, writer })
          : buildKnowledgeDelegateDispatch({
              policy: "subagent",
              finalizeId: knowledgeEnd.finalizeId,
              projectRoot: project.projectRoot,
              writer,
              ...(context.host === "codex" ? { leadInstruction: KNOWLEDGE_DISPATCH_LEAD_INSTRUCTION } : {}),
            });
      }
    }
    return dispatch;
  }

  private endPostCommitEffects(
    entered: Array<{ ref: PlanRef; plan: import("@veewo/claw-core").PlanDocument; endedAt: string }>,
  ): ClawPostCommitEffectV1[] | undefined {
    const actions = entered.map((ended) => ({
      type: "completion.refresh" as const,
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
  ): ClawHostActionV1[] {
    if (!isHostActionsHost(context.host as ClawHost | undefined)) return [];
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
    }, {
      actionIdPrefix,
      includeLightweightProcessProgress: resolveHostIntegrationProfile(context.host)?.consumesPlanProgress === true,
      includePlanProgress: resolveHostIntegrationProfile(context.host)?.consumesPlanProgress === true,
    });
  }

  private async codexActionsForPlan(
    context: CommandContext,
    input: {
      command: string;
      scope?: "project" | "session";
      taskName: string;
      planFile: string;
      plan: PlanDocument;
      actionIdPrefix?: string;
      recoveryResync?: boolean;
      forceProjectionSync?: boolean;
    },
  ): Promise<ClawHostActionV1[]> {
    if (!isHostActionsHost(context.host as ClawHost | undefined)) return [];
    const project = this.resolveProject(context, input.scope);
    const goalPlan = resolveThreadGoalPlan({
      cwd: context.cwd,
      taskName: input.taskName,
      focusedPlan: input.plan,
      scope: project.scope,
      ownerSessionKey: this.ownerSessionKey(context),
    });
    const workflowGuidance = await buildPlanWorkflowGuidance({
      taskName: input.taskName,
      planFile: input.planFile,
      plan: input.plan,
      projectRoot: project.projectRoot,
      projectConfig: resolvePlanEffectiveConfig(project.projectConfig, input.plan),
      goalPlan,
      goalProjectConfig: resolvePlanEffectiveConfig(project.projectConfig, goalPlan),
      scope: project.scope,
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
    }, {
      actionIdPrefix,
      forceProjectionSync: input.forceProjectionSync,
      includeLightweightProcessProgress: resolveHostIntegrationProfile(context.host)?.consumesPlanProgress === true,
      includePlanProgress: resolveHostIntegrationProfile(context.host)?.consumesPlanProgress === true,
    });
  }
}

function parsePlanId(
  project: ReturnType<typeof resolveWorkflowProjectContext>,
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

function planRefFromAbsolutePath(
  project: ReturnType<typeof resolveWorkflowProjectContext>,
  planPath: string,
): PlanRef {
  const relative = path.relative(project.tasksDir, path.resolve(planPath));
  const segments = relative.split(path.sep).filter(Boolean);
  if (relative.startsWith("..") || path.isAbsolute(relative) || segments.length < 2) {
    throw new ClawError("PLAN_NOT_FOUND", `Bound plan is outside the active task layout: ${planPath}`);
  }
  return createPlanRef(project, segments.at(-2)!, segments.at(-1)!);
}
